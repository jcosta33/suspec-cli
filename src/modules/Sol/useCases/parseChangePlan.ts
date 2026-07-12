// Parse a change plan (`type: change-plan`) into the record the change-plan checks (C010/C011) key
// on — a sibling to parse_spec_record. Pure: the source string is never mutated and no state is held
// between calls.
//
// What it reads (the canonical change-plan shape — the canon's transformation fixture is the exemplar):
//   - `kind` and the `preserves:` ref list from the frontmatter;
//   - the `## Behavioral preservation guarantees` table — every row's id and its `Verify with` cell;
//   - the `## Transformation waves` section — each wave entry and whether it names a green check.
//
// The record is deliberately structural — the check engine (Core) defines its own view and the
// assignability check at the call site catches drift at compile time (model isolation).

import { type Result, ok, err, isErr } from '../../../infra/errors/result.ts';
import { type AppError } from '../../../infra/errors/createAppError.ts';
import { split_frontmatter } from '../services/frontmatter.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';
import { scan_markdown } from '../../../infra/markdownScan.ts';

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

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
// A guarantees / preserves id: a cross-spec ref `SPEC-x#AC-002` or a plan-local id `PG-001`. The
// spec part is `WORD-...`; the anchor after `#` is `AC-`/`C-`/`I-`-style (letters, dash, digits).
const SPEC_REF = /^([A-Za-z][\w-]*)#([A-Za-z][\w-]*-\d+)$/;
const PLAN_LOCAL_ID = /^PG-\d+$/;
// A wave names verification through an explicit check/verify phrase, the full-suite shorthand, or
// a run verb bound to an inline command. An arbitrary code span can be a path or symbol and is not
// evidence by itself.
const NAMES_CHECK = /\bgreen check\b|\bverify(?: with| by)?\b|\bthe full suite\b|\b(?:run|rerun|re-run)\s+`[^`]+`/i;

const GUARANTEES_TITLE = 'behavioral preservation guarantees';
const WAVES_TITLE = 'transformation waves';

// One frontmatter list value can carry a ref plus trailing prose; keep the leading token. A
// flow-style `preserves: [a, b]` is split on commas; a bracket pair is stripped first.
function ref_tokens(value: string): string[] {
    const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
    return inner
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

function read_kind_and_preserves(
    lines: readonly string[],
    end_line: number
): { kind: string | null; preserves: PreservedRef[] } {
    let kind: string | null = null;
    const preserves: PreservedRef[] = [];
    let collecting_preserves = false;

    for (let index = 1; index < end_line - 1; index += 1) {
        const line = lines[index];
        const list_match = /^\s+-\s+(.*)$/.exec(line);
        if (collecting_preserves && list_match !== null) {
            for (const token of ref_tokens(list_match[1])) {
                preserves.push(classify_ref(token, index + 1));
            }
            continue;
        }
        const key_match = /^(\w[\w-]*):\s*(.*)$/.exec(line);
        if (key_match === null) {
            continue;
        }
        collecting_preserves = false;
        const key = key_match[1];
        const rest = normalize_scalar(key_match[2]);
        if (key === 'kind') {
            kind = rest.length > 0 ? rest : null;
            continue;
        }
        if (key === 'preserves') {
            if (rest.length === 0) {
                collecting_preserves = true;
            } else {
                for (const token of ref_tokens(rest)) {
                    preserves.push(classify_ref(token, index + 1));
                }
            }
            continue;
        }
    }
    return { kind, preserves };
}

// The leading cell of a markdown table row (`| ID | … |` → `ID`), trimmed; null for a non-row line
// or the header separator (`|---|---|`).
function first_cell(line: string): string | null {
    if (!line.trimStart().startsWith('|')) {
        return null;
    }
    const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
    if (cells.length === 0) {
        return null;
    }
    const id = cells[0];
    if (id.length === 0 || /^-+$/.test(id) || id.toLowerCase() === 'id') {
        return null;
    }
    return id;
}

export function parse_change_plan(input: ParseChangePlanInput): ParseChangePlanResult {
    const split = split_frontmatter(input.source);
    if (isErr(split)) {
        return err(split.error);
    }

    const { lines, frontmatter_end_line } = split.value;
    const { kind, preserves } = read_kind_and_preserves(lines, frontmatter_end_line);

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
        const line = body_lines[offset];
        const source_line = body_start_line + offset;

        // A fenced code block is verbatim — a `## …` heading or a `1.` list item quoted in a code
        // block is not a real section switch or a real wave entry.
        if (scanned[offset].inFence) {
            continue;
        }

        const section_match = SECTION_HEADING.exec(line);
        if (section_match !== null) {
            const title = section_match[1].toLowerCase();
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
