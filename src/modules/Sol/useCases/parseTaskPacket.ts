// Parse a task packet's declared inputs (M2, AC-017/018): the `scope` (the in-scope requirement id
// set), the Affected-areas / Do-not-change path prefixes, and the embedded spec snapshot. Pure: the
// source string is never mutated and no state is held between calls.
//
// `scope` is flow-style in the packet frontmatter (`scope: [AC-001, AC-002]`). Rather than route it
// through a generic frontmatter reader that would keep the flow list as one opaque string, this
// reader splits it deliberately: it scans the frontmatter lines for the `scope:` key, strips the
// surrounding brackets, splits on commas, and keeps the requirement ids.

import { isErr } from '../../../infra/errors/result.ts';
import { scan_markdown } from '../../../infra/markdownScan.ts';
import { split_frontmatter } from '../services/frontmatter.ts';

export type TaskPacket = Readonly<{
    // The declared in-scope requirement ids (`scope:` frontmatter), split from the flow-style list.
    scope: readonly string[];
    // The declared Affected-areas path prefixes (the `## Affected areas` section) — the ground truth
    // for "outside scope" (checks.yaml trigger-coverage: checklist-level, the reviewer's own reconcile;
    // no engine rule computes it). A context prefix (`web: src/…`) is stripped to the path part —
    // matchers compare the path.
    affectedAreas: readonly string[];
    // The declared protected paths (the `## Do not change` section). A changed file matching one is
    // surfaced as a do-not-change-touched fact (C014, ADR-0086) — distinct from outsideScope, since a
    // protected path may lie inside Affected areas. Same path/prefix + placeholder-skip semantics.
    doNotChange: readonly string[];
    // The embedded spec slice (ADR-0100, suspec-cli#2): the spec id + scoped requirements (id + Verify
    // command) copied into the task's `## Spec snapshot` at cut. Lets a review be validated when the live
    // spec is in a SEPARATE repo (unresolvable from the workspace). null id + [] when no snapshot.
    embeddedSpecId: string | null;
    embeddedRequirements: readonly { id: string; verifyCommand: string | null }[];
}>;

const REQUIREMENT_ID = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const SCOPE_KEY = /^scope:\s*(.*)$/;
const AFFECTED_AREAS_HEADING = /^##\s+Affected areas\s*$/i;
const DO_NOT_CHANGE_HEADING = /^##\s+Do not change\s*$/i;
const ANY_H2 = /^##\s+/;
const BACKTICK_TOKEN = /`([^`]+)`/g;
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
// key, so a wrapped scope is not silently under-read (private workspace #15). [] when there is no fence / no key.
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
    const scanned = scan_markdown(lines);
    const out: string[] = [];
    let inSection = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        // A `## …` heading INSIDE a fenced code block is verbatim example text — it must neither open nor
        // close a section (the structure-blind splitter previously false-closed a section on a fenced H2).
        if (scanned[index].inFence) {
            if (inSection) {
                out.push(line);
            }
            continue;
        }
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
// entry also comes in the prose-with-path form (`- The support email pipeline (\`src/email/\`)`). A
// narrowing to leading-backtick-only was tried and REVERTED — a declared path and an incidentally-
// mentioned one share the same syntax, so the narrowing dropped genuinely-protected paths (a C014 false
// NEGATIVE — worse than the false positive it removed, because the protected-file touch then goes
// unflagged). The residual false positive (a path named in a note) is surfaced as a human-attention
// WARNING, never a block (reconcile-only); a non-path mention like a table name never matches a real
// changed-file path, so it is harmless. The convention — keep the section to real protections — is a
// template note, not a parser guess.
function path_entries(lines: readonly string[]): string[] {
    const scanned = scan_markdown(lines);
    const areas: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        // A backticked path inside a fenced code example is verbatim, not a declared protection/area.
        if (scanned[index].inFence || line.includes('{{')) {
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

// The `## Spec snapshot` embedded slice (ADR-0100, suspec-cli#2). The section carries `embedded-spec:
// <id>` then `- <ID> — verify: \`cmd\`` (or `(none)`) lines.
const SPEC_SNAPSHOT_HEADING = /^##\s+Spec snapshot\s*$/i;
const EMBEDDED_SPEC = /^embedded-spec:\s*(\S+)\s*$/;
const EMBEDDED_REQ = /^-\s+([A-Z][A-Z0-9]*-\d+)\s+—\s+verify:\s*(.*)$/;

function embedded_spec_id(lines: readonly string[]): string | null {
    for (const line of lines) {
        const match = EMBEDDED_SPEC.exec(line.trim());
        if (match !== null) {
            return match[1];
        }
    }
    return null;
}

function embedded_requirements(lines: readonly string[]): { id: string; verifyCommand: string | null }[] {
    const out: { id: string; verifyCommand: string | null }[] = [];
    for (const line of lines) {
        const match = EMBEDDED_REQ.exec(line.trim());
        if (match === null) {
            continue;
        }
        const backtick = /^`([^`]+)`$/.exec(match[2].trim());
        out.push({ id: match[1], verifyCommand: backtick !== null ? backtick[1] : null });
    }
    return out;
}

export function parse_task_packet(source: string): TaskPacket {
    const snapshotLines = section_lines(source, SPEC_SNAPSHOT_HEADING);
    return {
        scope: read_scope(source),
        affectedAreas: path_entries(section_lines(source, AFFECTED_AREAS_HEADING)),
        doNotChange: path_entries(section_lines(source, DO_NOT_CHANGE_HEADING)),
        embeddedSpecId: embedded_spec_id(snapshotLines),
        embeddedRequirements: embedded_requirements(snapshotLines),
    };
}
