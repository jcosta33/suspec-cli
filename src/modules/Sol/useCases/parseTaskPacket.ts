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
import { logical_blocks, scan_markdown } from '../../../infra/markdownScan.ts';
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
    // The embedded spec slice (ADR-0100, suspec-cli#2): the spec id + scoped requirements (id + Verify
    // command) copied into the task's `## Spec snapshot` at cut. Lets a review be validated when the live
    // spec is in a SEPARATE repo (unresolvable from the workspace). null id + [] when no snapshot.
    embeddedSpecId: string | null;
    embeddedRequirements: readonly { id: string; verifyCommand: string | null }[];
}>;

const REQUIREMENT_ID = /\b[A-Z][A-Z0-9]*-\d+\b/g;
const SCOPE_KEY = /^scope:\s*(.*)$/;
const RUN_SUMMARY_HEADING = /^##\s+Run summary\s*$/i;
const AFFECTED_AREAS_HEADING = /^##\s+Affected areas\s*$/i;
const DO_NOT_CHANGE_HEADING = /^##\s+Do not change\s*$/i;
const ANY_H2 = /^##\s+/;
const BACKTICK_TOKEN = /`([^`]+)`/g;
// A bare path-like token (so prose words are skipped). Three shapes: a slash-separated path; a dotted
// filename with one or more dots and an optional leading dot (`a.ts`, `vite.config.ts`,
// `tsconfig.base.json`, `.eslintrc.json`, `.env.example` — suspec-works #44 widened this past the old
// single-dot form that dropped multi-dot config files); and a leading-dot dotfile with no extension
// (`.gitignore`, `.prettierrc`). A no-dot, no-slash, no-leading-dot token (`Makefile`, `LICENSE`) stays
// ambiguous with a prose word and is the only residual not recognized. Written non-backtracking — every
// `/`- or `.`-separated segment excludes its own separator, so a long non-matching token cannot trigger
// the quadratic backtracking the previous slash form had (an O(n²) ReDoS — suspec-works #15).
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
// key, so a wrapped scope is not silently under-read (suspec-works #15). [] when there is no fence / no key.
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
// entry is also the kit's prose-with-path form (`- The support email pipeline (\`src/email/\`)`). A
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

// The path-like tokens in one logical block's text — backtick-quoted by convention, with a bare-token
// fallback when none are backticked — keeping only the **path-like** ones (suspec-works #44). Path-validating
// both branches is the precision fix: a backticked non-path token (a commit sha `0791385`, a function
// name `reconcile_self_report`, a command) is not mistaken for a claimed file, so it cannot raise a
// spurious `claimedNotInDiff`; and prose with no path-like tokens yields no claims. The residual cost is
// the no-dot extensionless filename (`Makefile`, `LICENSE`): it stays ambiguous with a prose word.
function harvest_path_tokens(text: string): string[] {
    const backticked = [...text.matchAll(BACKTICK_TOKEN)].map((match) => match[1].trim());
    const candidates = backticked.length > 0 ? backticked : text.split(/[\s,]+/);
    return candidates.map((token) => token.trim()).filter((token) => token.length > 0 && PATH_LIKE.test(token));
}

// The `Changed files` LABEL of a Run-summary block — a list item / paragraph / heading whose text (after
// optional `**bold**`/`_emphasis_` wrappers) begins with "Changed files". The captured remainder is the
// inline path list (`Changed files: \`a\`, \`b\``), empty for the label-then-list layout.
const CHANGED_FILES_LABEL = /^[*_\s]*changed files[*_\s]*:?[*_\s]*(.*)$/i;

// From the Run summary lines, the claimed changed-file paths — read by STRUCTURE, not physical line,
// via the shared `logical_blocks` scanner so all three layouts reconcile to the same set:
//   - inline:  `- Changed files: \`a\`, \`b\``  (soft-wrapped continuation lines fold into the block — R5-I01/R5-I05)
//   - label+list:  `**Changed files:**` / `### Changed files` then a `- \`a\`` bullet list  (R5-I13 — the
//     case the old first-physical-line scanner dropped to zero claims)
// A block still carrying `{{placeholder}}` is template guidance, skipped.
function claimed_changed_files(lines: readonly string[]): string[] {
    const blocks = logical_blocks(lines);
    const paths: string[] = [];
    for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index];
        const label = CHANGED_FILES_LABEL.exec(block.text);
        if (label === null || block.text.includes('{{')) {
            continue;
        }
        const inline = label[1].trim();
        if (inline.length > 0) {
            // Inline form — the paths (and any folded soft-wrap continuations) are on the label block.
            paths.push(...harvest_path_tokens(inline));
            continue;
        }
        // Label-then-list form — the paths live in the FOLLOWING list items. Harvest the run of list-item
        // blocks: stop at a non-list block (a heading / paragraph ends the list), or — when the label is
        // itself a list item — at a sibling at the same-or-shallower indent (a different bullet's list).
        // Under a HEADING/paragraph label, the run continues across blank-separated bullets until the next
        // heading/prose: a path-like bullet under a `Changed files` heading IS a claimed changed file. This
        // deliberately PREFERS over-capture to under-capture — in a reconcile-only gate an extra claim is a
        // soft `claimed-not-changed` warning, whereas a DROPPED path re-creates the `changed-not-claimed`
        // false positive this scanner exists to kill (R5-I01); a non-path bullet harvests nothing anyway.
        for (let next = index + 1; next < blocks.length; next += 1) {
            const item = blocks[next];
            if (item.kind !== 'list-item') {
                break;
            }
            if (block.kind === 'list-item' && item.indent <= block.indent) {
                break;
            }
            if (!item.text.includes('{{')) {
                paths.push(...harvest_path_tokens(item.text));
            }
        }
    }
    return [...new Set(paths)].sort();
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
        claimedChangedFiles: claimed_changed_files(section_lines(source, RUN_SUMMARY_HEADING)),
        embeddedSpecId: embedded_spec_id(snapshotLines),
        embeddedRequirements: embedded_requirements(snapshotLines),
    };
}
