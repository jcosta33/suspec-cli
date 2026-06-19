// Parse a task packet's two reconcile inputs (M2, AC-017/018): the declared `scope` (the in-scope
// requirement id set) and the `## Run summary`'s self-reported changed-files list. Pure: the source
// string is never mutated and no state is held between calls.
//
// `scope` is flow-style in the packet frontmatter (`scope: [AC-001, AC-002]`). Rather than route it
// through a generic frontmatter reader that would keep the flow list as one opaque string, this
// reader splits it deliberately: it scans the frontmatter lines for the `scope:` key, strips the
// surrounding brackets, splits on commas, and keeps the requirement ids.
//
// The Run summary's changed-files claim is the hand-written `- Changed files: …` line(s) under the
// `## Run summary` H2 (ADR-0072 guarantees the section exists). Paths are reported as backtick-quoted
// tokens by convention (`src/x.ts`); we read those, falling back to bare path-like tokens so a packet
// that omitted the backticks still reconciles.

import { isErr } from '../../../infra/errors/result.ts';
import { split_frontmatter } from '../services/frontmatter.ts';

export type TaskPacket = Readonly<{
    // The declared in-scope requirement ids (`scope:` frontmatter), split from the flow-style list.
    scope: readonly string[];
    // The declared Affected-areas path prefixes (the `## Affected areas` section); the diff↔self-report
    // reconcile uses these as ground truth for "outside scope". A context prefix (`web: src/…`) is
    // stripped to the path part — matchers compare the path (checks.yaml trigger-coverage note).
    affectedAreas: readonly string[];
    // The declared protected paths (the `## Do not change` section). A changed file matching one is
    // surfaced as a do-not-change-touched fact (C014, ADR-0086) — distinct from outsideScope, since a
    // protected path may lie inside Affected areas. Same path/prefix + placeholder-skip semantics.
    doNotChange: readonly string[];
    // The files the Run summary claims changed (self-report; reconciled against the real diff).
    claimedChangedFiles: readonly string[];
}>;

const REQUIREMENT_ID = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const SCOPE_KEY = /^scope:\s*(.*)$/;
const RUN_SUMMARY_HEADING = /^##\s+Run summary\s*$/i;
const AFFECTED_AREAS_HEADING = /^##\s+Affected areas\s*$/i;
const DO_NOT_CHANGE_HEADING = /^##\s+Do not change\s*$/i;
const ANY_H2 = /^##\s+/;
const CHANGED_FILES_LINE = /changed files\s*:\s*(.*)$/i;
const BACKTICK_TOKEN = /`([^`]+)`/g;
// A bare path-like token: a path separator, or a dotted file name (so prose words are skipped).
const PATH_LIKE = /^[\w./@-]+\/[\w./@-]+$|^[\w@-]+\.[A-Za-z0-9]+$/;

// Split the flow-style `scope:` value into ids. `scope: [AC-001, AC-002]` and a bare scalar
// `scope: AC-001` both reduce to the requirement-id tokens found in the value.
function split_scope(rawValue: string): string[] {
    const inner = rawValue.trim().replace(/^\[/, '').replace(/\]$/, '');
    const ids: string[] = [];
    for (const segment of inner.split(',')) {
        const match = segment.match(REQUIREMENT_ID);
        if (match !== null) {
            ids.push(...match);
        }
    }
    return ids;
}

// The declared scope ids from the frontmatter `scope:` line, or [] when the packet has no fence /
// no scope key.
function read_scope(source: string): string[] {
    const split = split_frontmatter(source);
    if (isErr(split)) {
        return [];
    }
    const { lines, frontmatter_end_line } = split.value;
    for (let index = 1; index < frontmatter_end_line - 1; index += 1) {
        const match = SCOPE_KEY.exec(lines[index]);
        if (match !== null) {
            return split_scope(match[1]);
        }
    }
    return [];
}

// The body lines of the H2 section whose heading matches `heading` (until the next H2 or EOF).
function section_lines(source: string, heading: RegExp): string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
        if (heading.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && ANY_H2.test(line)) {
            break;
        }
        if (inSection) {
            out.push(line);
        }
    }
    return out;
}

// The backtick-quoted path prefixes declared in a section's list items — used for both `## Affected
// areas` and `## Do not change`. Each item carries a backtick-quoted path, possibly behind a workspace
// context prefix (`web: src/…`) — strip the prefix, keep the path. A line still carrying a
// `{{placeholder}}` is template guidance, skipped.
function path_entries(lines: readonly string[]): string[] {
    const areas: string[] = [];
    for (const line of lines) {
        if (line.includes('{{')) {
            continue;
        }
        for (const match of line.matchAll(BACKTICK_TOKEN)) {
            const token = match[1].trim();
            // Strip a workspace context prefix — `web: src/…` or the no-space `web:src/…` — to the
            // path part; an un-prefixed path is left as-is so it can match a repo-relative diff path.
            const path = token.replace(/^[\w-]+:\s*/, '').trim();
            if (path.length > 0) {
                areas.push(path);
            }
        }
    }
    return [...new Set(areas)].sort();
}

// From the Run summary lines, the claimed changed-file paths. Read every `Changed files: …` line's
// tokens: backtick-quoted first; if none, bare path-like tokens (so an un-backticked packet still
// reconciles). A line still carrying a `{{placeholder}}` is template guidance, skipped.
function claimed_changed_files(lines: readonly string[]): string[] {
    const paths: string[] = [];
    for (const line of lines) {
        const match = CHANGED_FILES_LINE.exec(line);
        if (match === null || line.includes('{{')) {
            continue;
        }
        const value = match[1];
        const backticked = [...value.matchAll(BACKTICK_TOKEN)].map((m) => m[1].trim());
        if (backticked.length > 0) {
            paths.push(...backticked);
            continue;
        }
        for (const token of value.split(/[\s,]+/)) {
            const trimmed = token.trim();
            if (trimmed.length > 0 && PATH_LIKE.test(trimmed)) {
                paths.push(trimmed);
            }
        }
    }
    return [...new Set(paths)].sort();
}

export function parse_task_packet(source: string): TaskPacket {
    return {
        scope: read_scope(source),
        affectedAreas: path_entries(section_lines(source, AFFECTED_AREAS_HEADING)),
        doNotChange: path_entries(section_lines(source, DO_NOT_CHANGE_HEADING)),
        claimedChangedFiles: claimed_changed_files(section_lines(source, RUN_SUMMARY_HEADING)),
    };
}
