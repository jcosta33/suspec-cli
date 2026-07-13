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

import { atx_heading_level, scan_markdown, strip_inline_code } from '../../../infra/markdownScan.ts';
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
    coverageRows: readonly CoverageRow[]; // Requirement coverage only (C012/C013 and waivers)
    changePlanCoverageRows: readonly CoverageRow[];
    verifyBlocks: readonly VerifyBlock[]; // the structured-evidence blocks in the coverage section
}>;

const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const COVERAGE_HEADING = /^## Requirement coverage[ \t]*$/;
const CHANGE_PLAN_COVERAGE_HEADING = /^## Change-plan coverage[ \t]*$/;
const OPEN_DECISIONS_HEADING = /^## Open decisions[ \t]*$/;
const REQUIREMENT_ID = /^[A-Z][A-Z0-9]*-\d+$/;
const REVIEW_DECISIONS = new Set(['pending', 'accepted', 'changes-requested', 'deferred']);
const ASSESSMENTS = new Set(['Supported', 'Unsupported', 'Unverified', 'Blocked']);
const CANONICAL_COVERAGE_HEADER = ['ID', 'Assessment', 'Evidence'] as const;

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

export function parse_review_packet(source: string, enforceContract = false): Result<ReviewPacket, AppError> {
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
    const id = scalar_field(fields, 'id') ?? null;
    const waivers = list_field(fields, 'waivers') ?? [];

    const sectionTitles: string[] = [];
    const coverageRows: CoverageRow[] = [];
    const changePlanCoverageRows: CoverageRow[] = [];
    const verifyBlocks: VerifyBlock[] = [];
    let coverageKind: 'requirement' | 'change-plan' | null = null;
    let coverageSectionCount = 0;
    let changePlanCoverageSectionCount = 0;
    let canonicalRequirementHeaderCount = 0;
    let canonicalChangePlanHeaderCount = 0;
    let malformedCoverageRow: { id: string; section: 'Requirement' | 'Change-plan' } | null = null;
    let inOpenDecisions = false;
    let openDecisionsBody = '';

    for (const scanned of scan_markdown(lines)) {
        // Fenced content is verbatim (ADR-0083) — never section/table structure, so a `## Requirement
        // coverage` heading or a `| … |` row quoted inside a code block leaks nothing. The one thing
        // read from a fence is a ```verify info-string opening inside the coverage section; its body
        // stays unparsed (scan_markdown marks every body line inFence, so it is skipped here).
        if (scanned.inFence) {
            if (inOpenDecisions) {
                openDecisionsBody += `${scanned.text}\n`;
            }
            if (scanned.opensFence && coverageKind === 'requirement') {
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
            coverageKind = 'requirement';
            coverageSectionCount += 1;
            inOpenDecisions = false;
            continue;
        }
        if (CHANGE_PLAN_COVERAGE_HEADING.test(line)) {
            sectionTitles.push('Change-plan coverage');
            coverageKind = 'change-plan';
            changePlanCoverageSectionCount += 1;
            inOpenDecisions = false;
            continue;
        }
        if (OPEN_DECISIONS_HEADING.test(line)) {
            sectionTitles.push('Open decisions');
            coverageKind = null;
            inOpenDecisions = true;
            continue;
        }
        const heading = SECTION_HEADING.exec(line);
        if (heading !== null) {
            sectionTitles.push(heading[1]);
            coverageKind = null;
            inOpenDecisions = false;
            continue;
        }
        const headingLevel = atx_heading_level(line);
        if (headingLevel !== null && headingLevel <= 2) {
            coverageKind = null;
            inOpenDecisions = false;
            continue;
        }
        if (inOpenDecisions) {
            openDecisionsBody += `${line}\n`;
        }
        if (coverageKind === null) {
            continue;
        }
        const cells = table_cells(line);
        if (cells === null || cells.length === 0) {
            continue;
        }
        if (is_separator_row(cells)) {
            continue;
        }
        const isCanonicalHeader =
            cells.length === CANONICAL_COVERAGE_HEADER.length &&
            cells.every((cell, index) => cell === CANONICAL_COVERAGE_HEADER[index]);
        if (isCanonicalHeader) {
            if (coverageKind === 'requirement') {
                canonicalRequirementHeaderCount += 1;
            } else {
                canonicalChangePlanHeaderCount += 1;
            }
            continue;
        }
        // A malformed header is not a data row. Contract mode rejects it below when the required
        // canonical Requirement-coverage header count is not exactly one.
        if (cells[0].toLowerCase() === 'id') {
            continue;
        }
        // A data row keys on a requirement id in column 1; read ID + Assessment + Evidence.
        if (REQUIREMENT_ID.test(cells[0])) {
            if (cells.length !== CANONICAL_COVERAGE_HEADER.length) {
                malformedCoverageRow = {
                    id: cells[0],
                    section: coverageKind === 'requirement' ? 'Requirement' : 'Change-plan',
                };
            }
            const row = { id: cells[0], assessment: cells[1] ?? '', evidence: cells[2] ?? '' };
            if (coverageKind === 'requirement') {
                coverageRows.push(row);
            } else {
                changePlanCoverageRows.push(row);
            }
        }
    }

    const contractError = (message: string): Result<ReviewPacket, AppError> =>
        err(
            createAppError('ParseFailure', message, {
                reason: 'invalid-review-contract',
                line: null,
            })
        );
    if (enforceContract) {
        if (id === null || id.trim().length === 0) {
            return contractError('review `id:` must be a non-empty scalar');
        }
        if (decision === null || !REVIEW_DECISIONS.has(decision)) {
            return contractError('review `decision:` must be pending, accepted, changes-requested, or deferred');
        }
        if (coverageSectionCount !== 1) {
            return contractError('review must contain exactly one `## Requirement coverage` section');
        }
        if (canonicalRequirementHeaderCount !== 1) {
            return contractError(
                'review Requirement coverage must contain exactly one canonical `| ID | Assessment | Evidence |` header'
            );
        }
        if (changePlanCoverageSectionCount > 0 && canonicalChangePlanHeaderCount !== changePlanCoverageSectionCount) {
            return contractError(
                'review Change-plan coverage must contain one canonical `| ID | Assessment | Evidence |` header per section'
            );
        }
        if (malformedCoverageRow !== null) {
            return contractError(
                `review ${malformedCoverageRow.section} coverage row ${malformedCoverageRow.id} must contain exactly ID, Assessment, and Evidence cells`
            );
        }
        if (coverageRows.length === 0) {
            return contractError('review must contain at least one valid Requirement coverage data row');
        }
        const allCoverageRows = [...coverageRows, ...changePlanCoverageRows];
        const invalidAssessment = allCoverageRows.find((row) => !ASSESSMENTS.has(row.assessment));
        if (invalidAssessment !== undefined) {
            return contractError(
                `review coverage row ${invalidAssessment.id} assessment must be Supported, Unsupported, Unverified, or Blocked`
            );
        }
        const duplicateWaivers = [...new Set(waivers.filter((waiver, index) => waivers.indexOf(waiver) !== index))];
        if (duplicateWaivers.length > 0) {
            return contractError(`review contains duplicate waiver ids: ${duplicateWaivers.join(', ')}`);
        }
        if (decision !== 'accepted' && fields.waivers !== undefined) {
            return contractError('review `waivers:` must be absent unless `decision: accepted`');
        }
        if (decision === 'accepted') {
            const blocked = allCoverageRows.filter((row) => row.assessment === 'Blocked').map((row) => row.id);
            if (blocked.length > 0) {
                return contractError(`accepted review contains blocked assessments for ${blocked.join(', ')}`);
            }
            const requiredWaivers = new Set(
                coverageRows
                    .filter((row) => row.assessment === 'Unsupported' || row.assessment === 'Unverified')
                    .map((row) => row.id)
            );
            if (requiredWaivers.size === 0 && fields.waivers !== undefined) {
                return contractError('review `waivers:` must be absent when no requirement row needs a waiver');
            }
            const waiverSet = new Set(waivers);
            const missing = [...requiredWaivers].filter((waiver) => !waiverSet.has(waiver));
            if (missing.length > 0) {
                return contractError(`accepted review is missing waivers for ${missing.join(', ')}`);
            }
            const unrelated = [...waiverSet].filter((waiver) => !requiredWaivers.has(waiver));
            if (unrelated.length > 0) {
                return contractError(`accepted review contains unrelated waivers for ${unrelated.join(', ')}`);
            }
            if (openDecisionsBody.trim().length > 0) {
                return contractError('accepted review must not contain a non-empty `## Open decisions` section');
            }
        }
    }

    return ok({
        decision,
        id,
        task: scalar_field(fields, 'task') ?? null,
        waivers,
        sectionTitles,
        coverageRows,
        changePlanCoverageRows,
        verifyBlocks,
    });
}
