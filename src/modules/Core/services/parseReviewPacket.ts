// Parse a review packet's markdown into the ReviewPacket record the structural + coverage reconciles
// key on (M2, AC-019/020/021). Pure: source string in, record out. A light line-scanner (like the
// spec parser), not a full markdown engine — it reads the frontmatter `status`, the H2 section
// titles, and the Requirement coverage table's rows (ID / Assessment / Evidence).
//
// The coverage table is the GFM pipe table under `## Requirement coverage`: a header row
// (`| ID | Assessment | Evidence |`), a `|---|` separator, then data rows. Template
// placeholder rows (`| AC-001 | Supported | {{test}} … |`) and example rows
// are real-looking; the engine only parses a packet a real run produced. Rows whose first cell is
// not requirement-ID-shaped are outside the coverage record consumed by the checks.

import { scan_markdown, strip_inline_code } from '../../../infra/markdownScan.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, isErr, ok, type Result } from '../../../infra/errors/result.ts';
import { list_field, parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';

// --- The review-packet shape the structural + coverage checks key on ----------------------------

export type CoverageRow = Readonly<{
    id: string;
    assessment: string; // Supported / Unsupported / Unverified / Blocked / malformed
    evidence: string; // empty = unverified-when-Supported
}>;

// A structured-evidence `verify` block (ADR-0083), parsed when a coverage row has a fenced
// sibling: the closed-value info-string only — `id` / `cmd` / `result` (`pass` | `fail`). The fenced
// BODY is deliberately never captured here: it is verbatim, self-reported, and unparsed (C013 reads a
// consistency fact off the info-string, never a verdict off the body). A block whose info-string does
// not parse to all three closed-value fields is surfaced as `malformed` rather than silently dropped,
// carrying whatever id it could read so the fact can be routed to a row.
export type VerifyBlock = Readonly<{
    id: string | null; // the keyed requirement id, or null when the info-string named none
    cmd: string | null; // the recorded command, or null when absent/unquoted
    result: 'pass' | 'fail' | null; // the closed-value pass signal, or null when absent/out-of-enum
    malformed: boolean; // the info-string did not parse to a complete, well-formed binding
}>;

export type ReviewPacket = Readonly<{
    decision: string | null; // frontmatter decision (or null when absent)
    id: string | null;
    task: string | null;
    waivers: readonly string[];
    sectionTitles: readonly string[];
    coverageRows: readonly CoverageRow[];
    verifyBlocks: readonly VerifyBlock[]; // the structured-evidence blocks in the coverage section
}>;

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const COVERAGE_HEADING = /^##\s+Requirement coverage\s*$/i;
const REQUIREMENT_ID = /^[A-Z][A-Z0-9]*-\d+$/;

// A verify block opens with ```` ```verify <info-string> ```` (ADR-0083): the `verify` language token
// then the info-string (the fenced body is verbatim and unparsed). scan_markdown exposes an opening
// fence's info string; VERIFY_INFO matches the `verify` prefix and captures the rest.
const VERIFY_INFO = /^verify\b\s*(.*)$/;
// The three closed-value info-string tokens. `cmd` is double-quoted (a command carries spaces); `id`
// and `result` are bare tokens.
const INFO_ID = /\bid=([A-Z][A-Z0-9]*-\d+)\b/;
const INFO_CMD = /\bcmd="([^"]*)"/;
const INFO_RESULT = /\bresult=(\w+)\b/;

// The cells of a GFM table row (`| a | b | c |` or `a | b | c`), trimmed, with optional outer pipes
// dropped. Splits only on a `|` OUTSIDE an inline-code span and not GFM-escaped (`\|`), so a piped
// shell command in an evidence cell (`` `grep x | wc -l` ``) is read as one cell. A non-table → null.
function table_cells(line: string): string[] | null {
    const trimmed = line.trim();
    // `masked` blanks inline-code spans (length-preserved), so a `|` inside a code span is not a split.
    const masked = strip_inline_code(trimmed);
    const cells: string[] = [];
    let start = 0;
    let sawDelimiter = false;
    for (let i = 0; i < trimmed.length; i += 1) {
        if (masked[i] === '|' && (i === 0 || masked[i - 1] !== '\\')) {
            sawDelimiter = true;
            cells.push(trimmed.slice(start, i).trim());
            start = i + 1;
        }
    }
    if (!sawDelimiter) {
        return null;
    }
    cells.push(trimmed.slice(start).trim());
    // `| a | b |` → ['', 'a', 'b', '']; only present boundary empties are outer pipes.
    if (cells[0] === '') {
        cells.shift();
    }
    if (cells[cells.length - 1] === '') {
        cells.pop();
    }
    return cells;
}

// A markdown table separator row (`|---|:--:|`): every cell is dashes/colons only.
function is_separator_row(cells: readonly string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

// Parse a verify block's info-string (the text after ```` ```verify ````) into the closed-value
// binding (AC-004). The fenced body is NEVER read — only this info-string. A block missing any of the
// three closed-value fields (id / a quoted cmd / a `pass`|`fail` result) is `malformed`: surfaced,
// not dropped, carrying whatever it could read so C013 can still route it to a row.
function parse_verify_info(info: string): VerifyBlock {
    const cmdMatch = INFO_CMD.exec(info);
    const cmd = cmdMatch !== null ? cmdMatch[1].trim() : null;
    // Match `id` / `result` against the info-string with EVERY quoted `cmd="…"` removed (global), so a
    // `result=` or `id=` token sitting inside any quoted command — including a second `cmd="…"` — can
    // never be misread as the binding's own.
    const outsideCmd = info.replace(/\bcmd="[^"]*"/g, '');
    const idMatch = INFO_ID.exec(outsideCmd);
    const resultMatch = INFO_RESULT.exec(outsideCmd);
    const id = idMatch !== null ? idMatch[1] : null;
    const resultToken = resultMatch !== null ? resultMatch[1] : null;
    const result = resultToken === 'pass' || resultToken === 'fail' ? resultToken : null;
    const malformed = id === null || cmd === null || result === null;
    return { id, cmd, result, malformed };
}

export function parse_review_packet(source: string): Result<ReviewPacket, AppError> {
    const lines = source.split(/\r\n|[\r\n]/);
    const parsedFrontmatter = parse_frontmatter(source);
    if (isErr(parsedFrontmatter)) {
        return err(parsedFrontmatter.error);
    }
    const fields = parsedFrontmatter.value.fields;
    for (const key of ['type', 'id', 'decision', 'task', 'pr', 'reviewer'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }
    if (fields.waivers !== undefined && !Array.isArray(fields.waivers)) {
        return err(
            createAppError('ParseFailure', 'frontmatter `waivers:` must be a list', {
                reason: 'unparseable-frontmatter',
                line: null,
            })
        );
    }
    const decision = scalar_field(fields, 'decision') ?? null;

    const sectionTitles: string[] = [];
    const coverageRows: CoverageRow[] = [];
    const verifyBlocks: VerifyBlock[] = [];
    let inCoverage = false;

    for (const scanned of scan_markdown(lines)) {
        // Fenced content is verbatim (ADR-0083) — never section/table structure, so a `## Requirement
        // coverage` heading or a `| … |` row quoted inside a code block leaks nothing. The one thing
        // read from a fence is a ```verify info-string opening inside the coverage section; its body
        // stays unparsed (scan_markdown marks every body line inFence, so it is skipped here).
        if (scanned.inFence) {
            if (scanned.opensFence && inCoverage) {
                const verifyMatch = VERIFY_INFO.exec(scanned.fenceInfo);
                if (verifyMatch !== null) {
                    verifyBlocks.push(parse_verify_info(verifyMatch[1]));
                }
            }
            continue;
        }
        const line = scanned.text;
        if (COVERAGE_HEADING.test(line)) {
            sectionTitles.push('Requirement coverage');
            inCoverage = true;
            continue;
        }
        const heading = SECTION_HEADING.exec(line);
        if (heading !== null) {
            sectionTitles.push(heading[1]);
            inCoverage = false;
            continue;
        }
        if (!inCoverage) {
            continue;
        }
        const cells = table_cells(line);
        if (cells === null || cells.length === 0) {
            continue;
        }
        // Skip the header row (`ID | Assessment | …`) and the `|---|` separator.
        if (is_separator_row(cells) || cells[0].toLowerCase() === 'id') {
            continue;
        }
        // A data row keys on a requirement id in column 1; read ID + Assessment + Evidence.
        if (REQUIREMENT_ID.test(cells[0])) {
            coverageRows.push({ id: cells[0], assessment: cells[1] ?? '', evidence: cells[2] ?? '' });
        }
    }

    return ok({
        decision,
        id: scalar_field(fields, 'id') ?? null,
        task: scalar_field(fields, 'task') ?? null,
        waivers: list_field(fields, 'waivers') ?? [],
        sectionTitles,
        coverageRows,
        verifyBlocks,
    });
}
