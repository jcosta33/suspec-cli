// Parse a plain Markdown spec into the common requirement record the check engine keys on. SOL
// (`format: sol`) is the stricter notation handled by the same structural parser; this
// is the default path. Pure: the source string is never mutated and no state is held between calls.
//
// The record is deliberately structural — the check engine (Core) defines its own ParsedSpec view
// and the assignability check at the call site catches any drift at compile time (model isolation).

import { type Result, ok, err, isErr } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import { scan_markdown, visible_text, strip_inline_code, type ScannedLine } from '../../../infra/markdownScan.ts';

export type SpecRecordRequirement = Readonly<{
    id: string;
    line: number;
    body: string;
    // The requirement's named verify command, lifted out of `body` (AC-003): the text after the
    // plain `Verify with:` line or the SOL `VERIFY BY` artifact reference, both resolved to the same
    // field a checker (C013) compares against a review packet's recorded `cmd`. Null when the
    // requirement carries no such line (C003 territory).
    verifyCommand: string | null;
}>;

export type SpecRecordLink = Readonly<{
    raw: string;
    line: number;
}>;

export type SpecRecordFrontmatter = Readonly<{
    type: string | null;
    id: string | null;
    status: string | null;
    format: string | null;
    sources: readonly string[];
}>;

export type SpecRecord = Readonly<{
    frontmatter: SpecRecordFrontmatter;
    requirements: readonly SpecRecordRequirement[];
    sectionTitles: readonly string[];
    intentBody: string;
    nonGoalsBody: string;
    openQuestionsPresent: boolean;
    bodyText: string;
    links: readonly SpecRecordLink[];
    // The deduped inline `[[KEY]]` citation keys (the text before any `|`), marked distinctly from
    // the markdown `](path)` links that also land in `links`. C015 keys on these — a `[[KEY]]` whose
    // key resolves to no `<a id="KEY">` anchor in the spec's sources.md is a dangling citation.
    citations: readonly string[];
    // Id-shaped `###` headings with a letter suffix (`AC-004a`) — NOT requirements (the grammar is
    // digits-only), captured so C019 can warn instead of letting the heading vanish silently.
    malformedRequirementHeadings: readonly { heading: string; line: number }[];
}>;

export type ParseSpecRecordInput = Readonly<{
    source: string;
    path: string;
}>;

export type ParseSpecRecordResult = Result<
    SpecRecord,
    AppError<'ParseFailure', { reason: string; line: number | null }>
>;

const REQUIREMENT_HEADING = /^###\s+([A-Z][A-Z0-9]*-\d+)\b/;
// The near-miss the real heading regex silently drops: an id-shaped `###` heading whose number
// carries a letter suffix (`AC-004a`). It parses as plain prose, so the requirement vanishes from
// scope and coverage with no signal — C019 exists to make that disappearance visible. Requirement
// ids are digits-only (ADR-0058); split requirements get their own numbers.
// Lowercase split-suffix only (`AC-004a`): the uppercase-continuation shape is prose
// (`### UTF-16LE handling`, `### C-3PO example`) and false-fires; the capture runs through
// word characters so the diagnostic quotes the whole token (`AC-004a_note`). ADR-0125 D3.
const MALFORMED_REQUIREMENT_HEADING = /^###\s+([A-Z][A-Z0-9]*-\d+[a-z][A-Za-z0-9_]*)/;
// A SOL (`format: sol`) requirement opens with `<KEYWORD> <ID>:` instead of a `### <ID>` markdown
// heading. The obligation block types — REQ (AC-), CONSTRAINT (C-), INVARIANT (I-), and INTERFACE
// (IF-) — share the requirement record consumed by the core checks. QUESTION (Q-) is an open
// question, not an obligation. Restrict this syntax to SOL specs so ordinary prose cannot become a
// requirement accidentally.
const SOL_REQUIREMENT_OPENER = /^(?:REQ|CONSTRAINT|INVARIANT|INTERFACE)\s+([A-Z][A-Z0-9]*-\d+)\s*:/;
const SOL_QUESTION_OPENER = /^QUESTION (Q-\d+) \[(blocking|non-blocking)\]:[ \t]*$/;
const SOL_QUESTION_CANDIDATE = /^[ \t]*QUESTION\b/i;
const SECTION_HEADING = /^##\s+(.+?)\s*$/;
const MARKDOWN_LINK = /\]\(([^)\s#]+)/g;
const WIKI_LINK = /\[\[([^\]]+)\]\]/g;

// The requirement's named verify command (AC-003): the text after a plain `Verify with:` line or a
// SOL `VERIFY BY` artifact reference, anchored to a line start (so it is the requirement's own line,
// not prose), and tolerant of a leading blockquote/list marker — the same line shape C003 keys on.
const VERIFY_COMMAND_PATTERN = /^[ \t>-]*(?:Verify with:|VERIFY BY)[ \t]*(.*\S)?\s*$/m;

// Lift the named command out of a requirement body. The first matching line wins; an empty command
// (a bare `Verify with:` with nothing after it) and the absence of any verify line both read null.
function extract_verify_command(body: string): string | null {
    const match = VERIFY_COMMAND_PATTERN.exec(body);
    if (match === null) {
        return null;
    }
    const command = match[1]?.trim() ?? '';
    return command.length > 0 ? command : null;
}

// One comma-segment of a frontmatter `sources:` item can carry a path plus trailing prose
// ("../x/spec.md (a note)"); keep only the leading whitespace-delimited token (the ref itself).
function source_tokens(entry: string): string[] {
    return entry
        .split(',')
        .map((segment) => segment.trim().split(/\s+/)[0])
        .filter((token) => token.length > 0);
}

function extract_links(scanned: readonly ScannedLine[], body_start_line: number): SpecRecordLink[] {
    const links: SpecRecordLink[] = [];
    for (let offset = 0; offset < scanned.length; offset += 1) {
        // A `](path)` or `[[KEY]]` inside a fenced example is verbatim text, not a live link — skip
        // fenced lines and strip inline code spans so a quoted example never registers (C009/C015
        // would otherwise fire on documentation of the syntax itself).
        if (scanned[offset].inFence) {
            continue;
        }
        const line = strip_inline_code(scanned[offset].text);
        const source_line = body_start_line + offset;
        for (const match of line.matchAll(MARKDOWN_LINK)) {
            links.push({ raw: match[1], line: source_line });
        }
        for (const match of line.matchAll(WIKI_LINK)) {
            links.push({ raw: match[1], line: source_line });
        }
    }
    return links;
}

// The citation KEY of a `[[KEY]]` / `[[KEY|text]]` match: the text before any `|`, trimmed (the
// anchor a `<a id="KEY">` in sources.md must carry). The `|text` tail is display text, not the key.
function citation_key(inner: string): string {
    return inner.split('|')[0].trim();
}

// The deduped inline `[[KEY]]` citation keys, marked distinctly from the markdown `](path)` links
// that share the `links` collection. Order-preserving (first occurrence wins) so a diagnostic citing
// a key is stable. A `[[ ]]` with an empty key is skipped — it names no anchor.
function extract_citations(scanned: readonly ScannedLine[]): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const scannedLine of scanned) {
        if (scannedLine.inFence) {
            continue;
        }
        const line = strip_inline_code(scannedLine.text);
        for (const match of line.matchAll(WIKI_LINK)) {
            const key = citation_key(match[1]);
            if (key.length === 0 || seen.has(key)) {
                continue;
            }
            seen.add(key);
            keys.push(key);
        }
    }
    return keys;
}

export function parse_spec_record(input: ParseSpecRecordInput): ParseSpecRecordResult {
    const parsedFrontmatter = parse_frontmatter(input.source);
    if (isErr(parsedFrontmatter)) {
        return err(parsedFrontmatter.error);
    }

    const { fields, lines, frontmatterEndLine: frontmatter_end_line } = parsedFrontmatter.value;
    for (const key of ['type', 'id', 'title', 'status', 'owner', 'format'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: null,
                })
            );
        }
    }
    if (fields.sources !== undefined && !Array.isArray(fields.sources)) {
        return err(
            createAppError('ParseFailure', 'frontmatter `sources:` must be a list', {
                reason: 'unparseable-frontmatter',
                line: null,
            })
        );
    }
    const sourceValue = fields.sources;
    const sourceEntries = sourceValue ?? [];
    const frontmatter: SpecRecordFrontmatter = {
        type: scalar_field(fields, 'type') ?? null,
        id: scalar_field(fields, 'id') ?? null,
        status: scalar_field(fields, 'status') ?? null,
        format: scalar_field(fields, 'format') ?? null,
        sources: sourceEntries.flatMap(source_tokens),
    };

    const body_lines = lines.slice(frontmatter_end_line);
    const body_start_line = frontmatter_end_line + 1; // 1-based source line of the first body line

    const requirements: SpecRecordRequirement[] = [];
    const sectionTitles: string[] = [];
    const malformedRequirementHeadings: { heading: string; line: number }[] = [];
    let nonGoalsBody = '';
    let intentBody = '';
    let openQuestionsPresent = false;

    const isSol = frontmatter.format === 'sol';
    let current_requirement: { id: string; line: number; bodyLines: string[] } | null = null;
    let in_non_goals = false;
    let in_intent = false;

    const flush_requirement = () => {
        if (current_requirement !== null) {
            const body = current_requirement.bodyLines.join('\n');
            requirements.push({
                id: current_requirement.id,
                line: current_requirement.line,
                body,
                verifyCommand: extract_verify_command(body),
            });
            current_requirement = null;
        }
    };

    const scanned = scan_markdown(body_lines);
    for (let offset = 0; offset < body_lines.length; offset += 1) {
        const line = scanned[offset].text;
        const source_line = body_start_line + offset;

        // A fenced code block is verbatim example text — never a requirement/section heading and never
        // part of a requirement's statement, so a quoted `### AC-NNN`, a fenced `## Non-goals` example,
        // or a fenced TBD / strength word does not register as live structure.
        if (scanned[offset].inFence) {
            continue;
        }

        const requirement_match = REQUIREMENT_HEADING.exec(line);
        if (requirement_match !== null) {
            flush_requirement();
            in_non_goals = false;
            in_intent = false;
            current_requirement = { id: requirement_match[1], line: source_line, bodyLines: [] };
            continue;
        }

        const malformed_match = MALFORMED_REQUIREMENT_HEADING.exec(line);
        if (malformed_match !== null) {
            malformedRequirementHeadings.push({ heading: malformed_match[1], line: source_line });
            // fall through: the heading still closes any open requirement via the generic H3 branch
        }

        // SOL requirement opener (`REQ <ID>:`) — only for `format: sol`, so a stray `REQ` in a plain spec
        // is never misread. The body lines that follow (WHEN/THE/MUST/VERIFY BY/…) collect normally, so
        // `extract_verify_command` lifts the `VERIFY BY` line for C003 just as it does for a plain spec.
        if (isSol) {
            const sol_match = SOL_REQUIREMENT_OPENER.exec(line);
            if (sol_match !== null) {
                flush_requirement();
                in_non_goals = false;
                in_intent = false;
                current_requirement = { id: sol_match[1], line: source_line, bodyLines: [] };
                continue;
            }
            const questionMatch = SOL_QUESTION_OPENER.exec(line);
            if (questionMatch !== null) {
                flush_requirement();
                in_non_goals = false;
                in_intent = false;
                openQuestionsPresent = true;
                continue;
            }
            if (SOL_QUESTION_CANDIDATE.test(line)) {
                return err(
                    createAppError(
                        'ParseFailure',
                        'SOL question header must be exactly `QUESTION Q-NNN [blocking]:` or `QUESTION Q-NNN [non-blocking]:`',
                        { reason: 'invalid-sol-question-header', line: source_line }
                    )
                );
            }
        }

        const section_match = SECTION_HEADING.exec(line);
        if (section_match !== null) {
            flush_requirement();
            const title = section_match[1];
            sectionTitles.push(title);
            const normalized = title.toLowerCase();
            in_non_goals = normalized === 'non-goals';
            in_intent = normalized === 'intent';
            if (normalized === 'open questions') {
                openQuestionsPresent = true;
            }
            continue;
        }

        // An H3 group heading (e.g. `### The check engine`) closes any open requirement/section body.
        if (line.startsWith('### ')) {
            flush_requirement();
            in_non_goals = false;
            in_intent = false;
            continue;
        }

        if (current_requirement !== null) {
            current_requirement.bodyLines.push(line);
        } else if (in_non_goals) {
            nonGoalsBody += `${line}\n`;
        } else if (in_intent) {
            intentBody += `${line}\n`;
        }
    }
    flush_requirement();

    return ok({
        frontmatter,
        requirements,
        sectionTitles,
        intentBody,
        nonGoalsBody,
        openQuestionsPresent,
        bodyText: visible_text(scanned),
        links: extract_links(scanned, body_start_line),
        citations: extract_citations(scanned),
        malformedRequirementHeadings,
    });
}
