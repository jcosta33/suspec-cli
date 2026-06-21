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
// A bare path-like token (so prose words are skipped). Three shapes: a slash-separated path; a dotted
// filename with one or more dots and an optional leading dot (`a.ts`, `vite.config.ts`,
// `tsconfig.base.json`, `.eslintrc.json`, `.env.example` — swarm-hq #44 widened this past the old
// single-dot form that dropped multi-dot config files); and a leading-dot dotfile with no extension
// (`.gitignore`, `.prettierrc`). A no-dot, no-slash, no-leading-dot token (`Makefile`, `LICENSE`) stays
// ambiguous with a prose word and is the only residual not recognized. Written non-backtracking — every
// `/`- or `.`-separated segment excludes its own separator, so a long non-matching token cannot trigger
// the quadratic backtracking the previous slash form had (an O(n²) ReDoS — swarm-hq #15).
const PATH_LIKE = /^[\w.@-]+(?:\/[\w.@-]+)+$|^\.?[\w@-]+(?:\.[\w@-]+)+$|^\.[\w@-]+$/;
// A top-level frontmatter key (`key:` at column 0) — bounds a wrapped `scope:` flow list.
const TOP_LEVEL_KEY = /^[A-Za-z0-9_-]+:/;

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

// The declared scope ids from the frontmatter `scope:` value. A flow list can wrap across lines
// (`scope: [AC-001,` … `]`) or sit entirely on the lines after `scope:` (the bracket-on-next-line and
// block-list shapes); accumulate continuation lines until the list closes (`]`) or the next top-level
// key, so a wrapped scope is not silently under-read (swarm-hq #15). [] when there is no fence / no key.
function read_scope(source: string): string[] {
    const split = split_frontmatter(source);
    if (isErr(split)) {
        return [];
    }
    const { lines, frontmatter_end_line } = split.value;
    for (let index = 1; index < frontmatter_end_line - 1; index += 1) {
        const match = SCOPE_KEY.exec(lines[index]);
        if (match === null) {
            continue;
        }
        let value = match[1];
        // If the value has not closed a flow list, gather following lines until `]` or the next
        // top-level key (exclusive). A complete bare scalar (`scope: AC-007`) stops at the next key
        // and is unaffected; an empty value picks up a bracket/block list on the lines below.
        if (!value.includes(']')) {
            for (let next = index + 1; next < frontmatter_end_line - 1; next += 1) {
                if (TOP_LEVEL_KEY.test(lines[next])) {
                    break;
                }
                value += ` ${lines[next]}`;
                if (lines[next].includes(']')) {
                    break;
                }
            }
        }
        return split_scope(value);
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
//
// EVERY backtick token is captured (not only a leading one): a `## Do not change` / `## Affected areas`
// entry is also the kit's prose-with-path form (`- The support email pipeline (\`src/email/\`)`). A
// narrowing to leading-backtick-only was tried and REVERTED — a declared path and an incidentally-
// mentioned one share the same syntax, so the narrowing dropped genuinely-protected paths (a C014 false
// NEGATIVE — worse than the false positive it removed, because the protected-file touch then goes
// unflagged). The residual false positive (a path named in a note) is surfaced as a human-attention
// WARNING, never a block (reconcile-only); a non-path mention like a table name never matches a real
// changed-file path, so it is harmless. The convention — keep the section to real protections — is a
// template note, not a parser guess.
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
// tokens — backtick-quoted by convention, with a bare-token fallback when a line carries none — and
// keep only the **path-like** ones (swarm-hq #44). Path-validating both branches is the precision
// fix: a backticked non-path token (a commit sha `0791385`, a function name `reconcile_self_report`,
// a command) is no longer mistaken for a claimed file, so it cannot raise a spurious
// `claimedNotInDiff`; and a prose Run summary with no path-like tokens yields no claims (the gate
// then notes "no machine-checkable paths" once, rather than flooding `inDiffNotClaimed`). The residual
// cost is the no-dot extensionless filename (`Makefile`, `LICENSE`, `Dockerfile`): it stays ambiguous
// with a prose word, so backticked alone it reads as no-claim, and backticked alongside other paths it
// is dropped from the claim set — which can still surface it as `inDiffNotClaimed` (a narrow residual
// false positive for that one class). A line still carrying `{{placeholder}}` is template guidance, skipped.
// A soft-wrapped continuation of the previous bullet: indented, non-blank, and NOT itself a new list
// item (`- `/`* `/`+ `) or a heading — so `  preserved), \`test_snippets.py\`` continues the
// `- Changed files:` bullet while `  - AC-001 …` (a sub-bullet) and `- Verify results` (a new bullet)
// end it. Reading the whole logical bullet is what kills the changed-not-claimed false positive on
// paths that wrapped onto a continuation line (R5-I01 / R5-I05).
function is_soft_wrap_continuation(line: string): boolean {
    if (line.trim().length === 0 || !/^\s/.test(line)) {
        return false;
    }
    const afterIndent = line.replace(/^\s+/, '');
    return !/^[-*+]\s/.test(afterIndent) && !afterIndent.startsWith('#');
}

function claimed_changed_files(lines: readonly string[]): string[] {
    const paths: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        const match = CHANGED_FILES_LINE.exec(lines[index]);
        if (match === null || lines[index].includes('{{')) {
            continue;
        }
        // Gather the whole LOGICAL `Changed files:` bullet — the matched line plus any soft-wrapped
        // continuation lines — before extracting path tokens, so a wrapped list does not drop the names
        // on its continuation lines (which then false-flagged as changed-not-claimed, R5-I01/R5-I05).
        let value = match[1];
        let next = index + 1;
        while (next < lines.length && is_soft_wrap_continuation(lines[next])) {
            value += ` ${lines[next].trim()}`;
            next += 1;
        }
        if (value.includes('{{')) {
            continue;
        }
        const backticked = [...value.matchAll(BACKTICK_TOKEN)].map((m) => m[1].trim());
        // Prefer the explicit backticked tokens; fall back to bare whitespace/comma-split tokens when a
        // line backticked none. Either way, keep only path-like tokens (so prose words and non-path
        // backticked tokens are both dropped).
        const candidates = backticked.length > 0 ? backticked : value.split(/[\s,]+/);
        for (const token of candidates) {
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
