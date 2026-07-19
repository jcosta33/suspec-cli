// Parse a Markdown spec into the common requirement record the check engine keys on.
// Pure: the source string is never mutated and no state is held between calls.
//
// The record is deliberately structural — the check engine (Core) defines its own ParsedSpec view
// and the assignability check at the call site catches any drift at compile time (model isolation).

import { type Result, ok, err, isErr } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_frontmatter, scalar_field } from '../../../infra/frontmatter.ts';
import {
    atx_heading,
    scan_markdown,
    visible_text,
    strip_inline_code,
    type ScannedLine,
} from '../../../infra/markdownScan.ts';

export type SpecRecordRequirement = Readonly<{
    id: string;
    line: number;
    body: string;
    condition: string | null;
    response: string | null;
    // The requirement's named verify command, lifted out of `body` (AC-003): the value of the
    // `Verify with:` item, resolved to the field a checker (C013) compares against a review packet's
    // recorded `cmd`. Null when the requirement carries no such line (C003 territory).
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

const REQUIREMENT_TITLE = /^([A-Z][A-Z0-9]*-\d+)\b/;
// The near-miss the real heading regex silently drops: an id-shaped `###` heading whose number
// carries a letter suffix (`AC-004a`). It parses as plain prose, so the requirement vanishes from
// scope and coverage with no signal — C019 exists to make that disappearance visible. Requirement
// ids are digits-only (ADR-0058); split requirements get their own numbers.
// Lowercase split-suffix only (`AC-004a`): the uppercase-continuation shape is prose
// (`### UTF-16LE handling`, `### C-3PO example`) and false-fires; the capture runs through
// word characters so the diagnostic quotes the whole token (`AC-004a_note`). ADR-0125 D3.
const MALFORMED_REQUIREMENT_TITLE = /^([A-Z][A-Z0-9]*-\d+[a-z][A-Za-z0-9_]*)/;
const SPEC_STATUSES = new Set(['draft', 'ready']);
const MARKDOWN_LINK = /\]\((?:<([^>\r\n]+)>|([^\s)]+))\)/g;
const WIKI_LINK = /\[\[([^\]]+)\]\]/g;

// The canonical requirement fields. Exact list markers keep free prose from impersonating a field.
const CONDITION_PATTERN = /^- When:[ \t]*(.*\S)?[ \t]*$/m;
const RESPONSE_PATTERN = /^- Then:[ \t]*(.*\S)?[ \t]*$/m;
const VERIFY_COMMAND_PATTERN = /^- Verify with:[ \t]*(.*\S)?[ \t]*$/m;

function extract_requirement_field(pattern: RegExp, body: string): string | null {
    const match = pattern.exec(body);
    const value = match?.[1]?.trim() ?? '';
    return value.length > 0 ? value : null;
}

// Lift the named command out of a requirement body. The first matching item wins; an empty value
// and the absence of the item both read null.
function extract_verify_command(body: string): string | null {
    return extract_requirement_field(VERIFY_COMMAND_PATTERN, body);
}

// One list item is one ref. The frontmatter parser already splits inline lists and removes balanced
// quotes, so preserve all internal characters; quoted paths may contain spaces or commas.
function source_tokens(entry: string): string[] {
    const token = entry.trim();
    return token.length === 0 ? [] : [token];
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
            const destination = match[1] ?? match[2];
            const raw = destination.split('#', 1)[0];
            if (raw.length > 0) links.push({ raw, line: source_line });
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

    const { fields, fieldLines, lines, frontmatterEndLine: frontmatter_end_line } = parsedFrontmatter.value;
    for (const key of ['type', 'id', 'title', 'status', 'owner'] as const) {
        if (fields[key] !== undefined && typeof fields[key] !== 'string') {
            return err(
                createAppError('ParseFailure', `frontmatter \`${key}:\` must be a scalar`, {
                    reason: 'unparseable-frontmatter',
                    line: fieldLines[key] ?? null,
                })
            );
        }
    }
    if (fields.sources !== undefined && !Array.isArray(fields.sources)) {
        return err(
            createAppError('ParseFailure', 'frontmatter `sources:` must be a list', {
                reason: 'unparseable-frontmatter',
                line: fieldLines.sources ?? null,
            })
        );
    }
    const status = scalar_field(fields, 'status') ?? null;
    if (status !== null && !SPEC_STATUSES.has(status)) {
        return err(
            createAppError('ParseFailure', 'frontmatter `status:` must be draft or ready', {
                reason: 'invalid-spec-contract',
                line: fieldLines.status ?? null,
            })
        );
    }
    const sourceValue = fields.sources;
    const sourceEntries = sourceValue ?? [];
    const frontmatter: SpecRecordFrontmatter = {
        type: scalar_field(fields, 'type') ?? null,
        id: scalar_field(fields, 'id') ?? null,
        status,
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

    let current_requirement: { id: string; line: number; bodyLines: string[] } | null = null;
    let in_non_goals = false;
    let in_intent = false;
    let in_requirements = false;

    const flush_requirement = () => {
        if (current_requirement !== null) {
            const body = current_requirement.bodyLines.join('\n');
            requirements.push({
                id: current_requirement.id,
                line: current_requirement.line,
                body,
                condition: extract_requirement_field(CONDITION_PATTERN, body),
                response: extract_requirement_field(RESPONSE_PATTERN, body),
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

        const heading = atx_heading(line);
        const requirement_match =
            in_requirements && heading?.level === 3 ? REQUIREMENT_TITLE.exec(heading.title) : null;
        if (requirement_match !== null) {
            flush_requirement();
            in_non_goals = false;
            in_intent = false;
            current_requirement = { id: requirement_match[1], line: source_line, bodyLines: [] };
            continue;
        }

        const malformed_match =
            in_requirements && heading?.level === 3 ? MALFORMED_REQUIREMENT_TITLE.exec(heading.title) : null;
        if (malformed_match !== null) {
            malformedRequirementHeadings.push({ heading: malformed_match[1], line: source_line });
            // fall through: the heading still closes any open requirement via the generic H3 branch
        }

        if (heading?.level === 2 && heading.title.length > 0) {
            flush_requirement();
            const title = heading.title;
            sectionTitles.push(title);
            const normalized = title.toLowerCase();
            in_non_goals = normalized === 'non-goals';
            in_intent = normalized === 'intent';
            in_requirements = normalized === 'requirements';
            if (normalized === 'open questions') {
                openQuestionsPresent = true;
            }
            continue;
        }

        // A higher-level heading closes the section it exits. H1/H2 close an H2 body; H1-H3 close
        // an H3 requirement. Lower headings remain nested content.
        const headingLevel = heading?.level ?? null;
        if (headingLevel !== null && headingLevel <= 3) {
            flush_requirement();
            if (headingLevel <= 2) {
                in_non_goals = false;
                in_intent = false;
                in_requirements = false;
            }
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
