// Parse a change plan (`type: change-plan`) into the record the change-plan checks (C010/C011) key
// on — a sibling to parse_spec_record. Pure: the source string is never mutated and no state is held
// between calls.
//
// What it reads (the canonical change-plan shape — the canon's transformation fixture is the exemplar):
//   - `kind` and the `preserves:` ref list from the frontmatter;
//   - the `## Preservation guarantees` table — every row's id and its `Verify with` cell;
//   - the `## Transformation waves` section — each wave entry and whether it names a green check.
//
// The record is deliberately structural — the check engine (Core) defines its own view and the
// assignability check at the call site catches drift at compile time (model isolation).

import { type Result, ok, err, isErr } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { list_field, parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import { atx_heading, scan_markdown } from '../../../infra/markdownScan.ts';

// A preserved-behavior id: either a cross-spec reference (`SPEC-checkout#AC-002`) or a plan-local
// guarantee id (`PG-001`). Sourced from the frontmatter `preserves:` list or the guarantees table.
export type PreservedRef = Readonly<{
    raw: string;
    // The named spec id when the ref is `SPEC-x#AC-NNN` (the part before `#`), else null (a bare
    // `PG-NNN` plan-local id carries no spec).
    specId: string | null;
    // The requirement/anchor id when the ref is `SPEC-x#AC-NNN` (the part after `#`), else null.
    acId: string | null;
    line: number;
}>;

// One wave of the Transformation-waves section: its text and whether it names a green check/verify
// step (the C011 signal — a wave that names no check is incomplete).
export type ChangePlanWave = Readonly<{
    text: string;
    namesCheck: boolean;
    line: number;
}>;

export type ChangePlanRecord = Readonly<{
    kind: string | null;
    // Every id in `preserves:` and in the guarantees table, with its spec/ac split. C010 resolves
    // each: a SPEC-x#AC-NNN against the named spec, a plan-local PG-NNN against guaranteeIds.
    preservedRefs: readonly PreservedRef[];
    // The ids defined in the plan's own guarantees table — a PG-NNN here is a valid plan-local id.
    guaranteeIds: readonly string[];
    // The Transformation-waves entries; empty when the section is absent/empty (the C011 signal).
    waves: readonly ChangePlanWave[];
}>;

export type ParseChangePlanInput = Readonly<{
    source: string;
    path: string;
}>;

export type ParseChangePlanResult = Result<
    ChangePlanRecord,
    AppError<'ParseFailure', { reason: string; line: number | null }>
>;

// A guarantees / preserves id: a cross-spec ref `SPEC-x#AC-002` or a plan-local id `PG-001`. The
// spec part is `WORD-...`; the anchor after `#` is `AC-`/`C-`/`I-`-style (letters, dash, digits).
const SPEC_REF = /^([A-Za-z][\w-]*)#([A-Za-z][\w-]*-\d+)$/;
const PLAN_LOCAL_ID = /^PG-\d+$/;
// A wave names verification through an explicit check/verify phrase, the full-suite shorthand, or
// a run verb bound to an inline command. An arbitrary code span can be a path or symbol and is not
// evidence by itself.
const NAMES_CHECK = /\bgreen check\b|\bverify(?: with| by)?\b|\bthe full suite\b|\b(?:run|rerun|re-run)\s+`[^`]+`/i;

const GUARANTEES_TITLE = 'preservation guarantees';
const WAVES_TITLE = 'transformation waves';

// One frontmatter list value can carry a ref plus trailing prose; keep the leading token. A
// flow-style `preserves: [a, b]` is split on commas; a bracket pair is stripped first.
function ref_tokens(value: string): string[] {
    return value
        .split(',')
        .map((segment) => segment.trim().split(/\s+/)[0])
        .filter((token) => token.length > 0);
}

// Split a raw ref into its spec/ac parts. `SPEC-x#AC-002` → {specId, acId}; a bare `PG-001` →
// {null, null} (a plan-local id resolved against the guarantees table, not a spec).
function classify_ref(raw: string, line: number): PreservedRef {
    const match = SPEC_REF.exec(raw);
    if (match !== null) {
        return { raw, specId: match[1], acId: match[2], line };
    }
    return { raw, specId: null, acId: null, line };
}

// The leading cell of a GFM table row (`| ID | … |` or `ID | …` → `ID`), trimmed; null for a
// non-row line or a header separator (`| :--- | ---: |`).
function first_cell(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) {
        return null;
    }
    const cells = trimmed.split('|').map((cell) => cell.trim());
    if (cells[0] === '') {
        cells.shift();
    }
    if (cells[cells.length - 1] === '') {
        cells.pop();
    }
    if (cells.length === 0) {
        return null;
    }
    const id = cells[0];
    if (id.length === 0 || /^:?-+:?$/.test(id) || id.toLowerCase() === 'id') {
        return null;
    }
    return id;
}

export function parse_change_plan(input: ParseChangePlanInput): ParseChangePlanResult {
    const parsedFrontmatter = parse_frontmatter(input.source);
    if (isErr(parsedFrontmatter)) {
        return err(parsedFrontmatter.error);
    }

    const { fields, lines, frontmatterEndLine: frontmatter_end_line } = parsedFrontmatter.value;
    for (const key of ['type', 'id', 'title', 'status', 'kind', 'owner'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }
    for (const key of ['sources', 'preserves'] as const) {
        if (fields[key] !== undefined && !Array.isArray(fields[key])) {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a list`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }
    const kind = scalar_field(fields, 'kind') ?? null;
    const preservesLine = lines.findIndex((line) => line.startsWith('preserves:')) + 1;
    const preserves = (list_field(fields, 'preserves') ?? []).flatMap((entry) =>
        ref_tokens(entry).map((token) => classify_ref(token, preservesLine || 1))
    );

    const body_lines = lines.slice(frontmatter_end_line);
    const body_start_line = frontmatter_end_line + 1; // 1-based source line of the first body line

    const guaranteeIds: string[] = [];
    const guaranteeRefs: PreservedRef[] = [];
    const waves: ChangePlanWave[] = [];
    type Section = 'guarantees' | 'waves' | 'other';
    let section: Section = 'other';
    let waveContinuation = false; // true while the open wave's list item can still fold a prose line

    const scanned = scan_markdown(body_lines);
    for (let offset = 0; offset < body_lines.length; offset += 1) {
        const line = scanned[offset].text;
        const source_line = body_start_line + offset;

        // A fenced code block is verbatim — a `## …` heading or a `1.` list item quoted in a code
        // block is not a real section switch or a real wave entry.
        if (scanned[offset].inFence) {
            continue;
        }

        const heading = atx_heading(line);
        if (heading?.level === 2 && heading.title.length > 0) {
            const title = heading.title.toLowerCase();
            if (title === GUARANTEES_TITLE) {
                section = 'guarantees';
            } else if (title === WAVES_TITLE) {
                section = 'waves';
            } else {
                section = 'other';
            }
            waveContinuation = false;
            continue;
        }

        const headingLevel = heading?.level ?? null;
        if (headingLevel !== null && headingLevel <= 2) {
            section = 'other';
            waveContinuation = false;
            continue;
        }

        if (section === 'guarantees') {
            const id = first_cell(line);
            if (id !== null) {
                guaranteeIds.push(id);
                guaranteeRefs.push(classify_ref(id, source_line));
            }
            continue;
        }

        if (section === 'waves') {
            // A wave entry is a list item — ordered (`1.`) or unordered (`-`/`*`). A continuation line
            // folds into the open wave (a check named on its second line still counts) UNTIL a blank
            // line ends the item — so a closing paragraph after the list does not fold into the last
            // wave, which would mask a genuinely check-less wave from C011.
            const itemMatch = /^\s*(?:\d+\.|[-*])\s+(.*)$/.exec(line);
            if (itemMatch !== null) {
                waves.push({ text: itemMatch[1], namesCheck: NAMES_CHECK.test(itemMatch[1]), line: source_line });
                waveContinuation = true;
            } else if (line.trim().length === 0) {
                waveContinuation = false;
            } else if (waveContinuation && waves.length > 0) {
                const open = waves[waves.length - 1];
                const text = `${open.text}\n${line}`;
                waves[waves.length - 1] = { text, namesCheck: NAMES_CHECK.test(text), line: open.line };
            }
        }
    }

    return ok({
        kind,
        // The guarantees table ids resolve plan-local PG-NNN; merge the preserves-list refs and the
        // table refs so C010 checks every preserved id from both homes.
        preservedRefs: [...preserves, ...guaranteeRefs],
        guaranteeIds: guaranteeIds.filter((id) => PLAN_LOCAL_ID.test(id) || SPEC_REF.test(id)),
        waves,
    });
}
