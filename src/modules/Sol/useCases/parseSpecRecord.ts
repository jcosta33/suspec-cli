// Parse a plain two-tier spec (the default form) into the common requirement record the check
// engine keys on. SOL (`format: sol`) is the opt-in stricter notation handled by parse_spec; this
// is the default path. Pure: the source string is never mutated and no state is held between calls.
//
// The record is deliberately structural — the check engine (Core) defines its own ParsedSpec view
// and the assignability check at the call site catches any drift at compile time (model isolation).

import { type Result, ok, err, isErr } from '../../../infra/errors/result.ts';
import { type AppError } from '../../../infra/errors/createAppError.ts';
import { split_frontmatter } from '../services/frontmatter.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';
import { scan_markdown, visible_text } from '../../../infra/markdownScan.ts';

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
    nonGoalsBody: string;
    openQuestionsPresent: boolean;
    bodyText: string;
    links: readonly SpecRecordLink[];
    // The deduped inline `[[KEY]]` citation keys (the text before any `|`), marked distinctly from
    // the markdown `](path)` links that also land in `links`. C015 keys on these — a `[[KEY]]` whose
    // key resolves to no `<a id="KEY">` anchor in the workspace's sources.md is a dangling citation.
    citations: readonly string[];
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

function parse_frontmatter(lines: readonly string[], end_line: number): SpecRecordFrontmatter {
    const scalars = new Map<string, string>();
    const sources: string[] = [];
    let collecting_sources = false;

    for (let index = 1; index < end_line - 1; index += 1) {
        const line = lines[index];
        const list_match = /^\s+-\s+(.*)$/.exec(line);
        if (collecting_sources && list_match !== null) {
            sources.push(...source_tokens(list_match[1]));
            continue;
        }
        const key_match = /^(\w[\w-]*):\s*(.*)$/.exec(line);
        if (key_match === null) {
            continue;
        }
        collecting_sources = false;
        const key = key_match[1];
        const rest = normalize_scalar(key_match[2]);
        if (key === 'sources') {
            if (rest.length === 0) {
                collecting_sources = true;
            } else {
                const inline = rest.replace(/^\[/, '').replace(/\]$/, '');
                sources.push(...source_tokens(inline));
            }
            continue;
        }
        scalars.set(key, rest);
    }

    return {
        type: scalars.get('type') ?? null,
        id: scalars.get('id') ?? null,
        status: scalars.get('status') ?? null,
        format: scalars.get('format') ?? null,
        sources,
    };
}

function extract_links(body_lines: readonly string[], body_start_line: number): SpecRecordLink[] {
    const links: SpecRecordLink[] = [];
    for (let offset = 0; offset < body_lines.length; offset += 1) {
        const line = body_lines[offset];
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
function extract_citations(body_lines: readonly string[]): string[] {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (const line of body_lines) {
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
    const split = split_frontmatter(input.source);
    if (isErr(split)) {
        return err(split.error);
    }

    const { lines, frontmatter_end_line } = split.value;
    const frontmatter = parse_frontmatter(lines, frontmatter_end_line);

    const body_lines = lines.slice(frontmatter_end_line);
    const body_start_line = frontmatter_end_line + 1; // 1-based source line of the first body line

    const requirements: SpecRecordRequirement[] = [];
    const sectionTitles: string[] = [];
    let nonGoalsBody = '';
    let openQuestionsPresent = false;

    let current_requirement: { id: string; line: number; bodyLines: string[] } | null = null;
    let in_non_goals = false;

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
        const line = body_lines[offset];
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
            current_requirement = { id: requirement_match[1], line: source_line, bodyLines: [] };
            continue;
        }

        const section_match = SECTION_HEADING.exec(line);
        if (section_match !== null) {
            flush_requirement();
            const title = section_match[1];
            sectionTitles.push(title);
            const normalized = title.toLowerCase();
            in_non_goals = normalized === 'non-goals';
            if (normalized === 'open questions') {
                openQuestionsPresent = true;
            }
            continue;
        }

        // An H3 group heading (e.g. `### The check engine`) closes any open requirement/section body.
        if (line.startsWith('### ')) {
            flush_requirement();
            in_non_goals = false;
            continue;
        }

        if (current_requirement !== null) {
            current_requirement.bodyLines.push(line);
        } else if (in_non_goals) {
            nonGoalsBody += `${line}\n`;
        }
    }
    flush_requirement();

    return ok({
        frontmatter,
        requirements,
        sectionTitles,
        nonGoalsBody,
        openQuestionsPresent,
        bodyText: visible_text(scanned),
        links: extract_links(body_lines, body_start_line),
        citations: extract_citations(body_lines),
    });
}
