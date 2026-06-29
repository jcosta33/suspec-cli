// `suspec show <kind> [ref] --json` — a read-only projection of a parsed Suspec artifact, the loader
// surface the MCP server (suspec-mcp, ADR-0085) adapts over the public `--json` contract. Reconcile-only:
// it parses + projects existing markdown (reusing the same parsers the reconcile engine uses — no
// second source of truth), writes nothing, and renders no verdict. One use-case dispatching on kind.

import { existsSync, readFileSync } from 'fs';
import { join, resolve, relative, isAbsolute, basename } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_task_packet, parse_spec_record } from '../../Sol/useCases/index.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { CORE_CHECKS, CONTRACT_VERSION } from '../services/checksContract.ts';
import { frontmatter_value, find_source_spec, resolve_task } from './taskLocator.ts';
import { usage_error } from './unixOutcome.ts';

export type ShowKind = 'task' | 'spec' | 'review' | 'checks';

// A uniform read-only result: level (always clean — a read never warns; a parse/lookup failure is an
// Err → exit 2), the kind, and the parsed `value`. `suspec review`/`suspec check` already cover the
// reconcile/diagnostic surfaces; this is purely the loader projection.
export type ShowResult = Readonly<{ level: 'clean'; kind: ShowKind; value: unknown }>;

export type ShowArtifactInput = Readonly<{ workspaceDir: string; kind: string; ref?: string }>;

// A workspace-relative spec ref is confined iff resolving it against the workspace stays inside it
// (no `../` escape, no absolute path). The task/review stems use the stricter is_safe_segment; the
// spec path-fallback may carry subdirectories (specs/foo/spec.md), so it uses this path check (#42).
function is_confined(workspaceDir: string, ref: string): boolean {
    const rel = relative(resolve(workspaceDir), resolve(workspaceDir, ref));
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// The raw body text of a `## <title>` section (the heading line excluded), or null when absent. Used to
// surface a spec's append-only `## Execution` run-record (ADR-0103/0104) — post-ephemeral the durable
// record of each change lives there — to the loader without a second parser. Fence-aware: a `## …`
// heading quoted inside a ``` fence neither opens nor closes the section. Captures to the next H2 or EOF.
function section_body(source: string, title: string): string | null {
    const lines = source.split(/\r\n|[\r\n]/);
    const wanted = title.toLowerCase();
    let inFence = false;
    let start = -1;
    let end = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const heading = /^##\s+(.+?)\s*$/.exec(line);
        if (heading === null) {
            continue;
        }
        if (start === -1) {
            if (heading[1].toLowerCase() === wanted) {
                start = index + 1;
            }
        } else {
            end = index;
            break;
        }
    }
    if (start === -1) {
        return null;
    }
    const body = lines.slice(start, end).join('\n').trim();
    return body.length > 0 ? body : null;
}

// Resolve a spec ref to its file path, accepting either the full `SPEC-<slug>` frontmatter id, the bare
// slug (`pastebin` → the `SPEC-pastebin` spec, or `specs/pastebin/spec.md`), or a confined workspace path.
// Accepting the bare slug mirrors the task resolution and closes the MCP get_spec gap the blind field
// test surfaced (`suspec show spec pastebin` previously failed while `SPEC-pastebin` worked).
function resolve_spec_path(workspaceDir: string, ref: string): string | null {
    const altId = /^SPEC-/i.test(ref) ? null : `SPEC-${ref}`;
    const byId = find_source_spec(workspaceDir, ref) ?? (altId !== null ? find_source_spec(workspaceDir, altId) : null);
    if (byId !== null) {
        return byId.path;
    }
    const bySlug = join(workspaceDir, 'specs', ref, 'spec.md');
    if (existsSync(bySlug)) {
        return bySlug;
    }
    if (is_confined(workspaceDir, ref)) {
        const byPath = join(workspaceDir, ref);
        if (existsSync(byPath)) {
            return byPath;
        }
    }
    return null;
}

export function show_artifact(input: ShowArtifactInput): Result<ShowResult, AppError> {
    const { workspaceDir } = input;
    let kind = input.kind;
    let ref = input.ref;

    // R4-ISS-16: accept `suspec show <path>` (kind omitted), the way `suspec check <path>` does. When the
    // first arg isn't a known kind but is a confined, existing .md file, infer the kind from its
    // frontmatter `type:` so pointing show at a file path no longer dead-ends on "unknown show kind".
    // A spec resolver takes the path directly; the task/review resolvers take a stem, so hand them the
    // basename without `.md`.
    if (ref === undefined && /\.(md|markdown)$/i.test(kind) && is_confined(workspaceDir, kind)) {
        const filePath = join(workspaceDir, kind);
        if (existsSync(filePath)) {
            const type = frontmatter_value(readFileSync(filePath, 'utf8'), 'type');
            if (type === 'spec') {
                ref = kind;
                kind = 'spec';
            } else if (type === 'task' || type === 'review') {
                ref = basename(filePath).replace(/\.(md|markdown)$/i, '');
                kind = type;
            }
        }
    }

    if (kind === 'checks') {
        // suspec-cli's own enforced contract (drift-guarded against canon's checks.yaml) — not a file read.
        return ok({ level: 'clean', kind: 'checks', value: { version: CONTRACT_VERSION, checks: CORE_CHECKS } });
    }

    if (kind === 'task') {
        if (ref === undefined) {
            return err(usage_error('usage: suspec show task <stem>'));
        }
        if (!is_safe_segment(ref)) {
            return err(usage_error(`invalid task stem: ${ref}`));
        }
        // Resolve by either the bare slug or the TASK- id to the canonical `tasks/TASK-<slug>.md`
        // (the file `suspec new task` writes), so `show task pastebin` and `show task TASK-pastebin`
        // both find it — and the MCP loader resolves regardless of how it normalizes the id.
        const resolved = resolve_task(workspaceDir, ref);
        if (resolved === null) {
            return err(usage_error(`no task matching "${ref}" (looked for tasks/${ref}.md and tasks/TASK-${ref}.md)`));
        }
        const source = resolved.source;
        const packet = parse_task_packet(source);
        return ok({
            level: 'clean',
            kind: 'task',
            value: {
                id: frontmatter_value(source, 'id'),
                source: frontmatter_value(source, 'source'),
                status: frontmatter_value(source, 'status'),
                scope: packet.scope,
                affectedAreas: packet.affectedAreas,
                doNotChange: packet.doNotChange,
                claimedChangedFiles: packet.claimedChangedFiles,
                // The cross-root embedded spec slice (ADR-0100 / `## Spec snapshot`) — present when the
                // task was cut against a spec in a separate repo, so a cross-root review validates against
                // it. `embeddedSpecId` is null and `embeddedRequirements` empty for the co-located case.
                embeddedSpecId: packet.embeddedSpecId,
                embeddedRequirements: packet.embeddedRequirements.map((r) => ({
                    id: r.id,
                    verifyCommand: r.verifyCommand,
                })),
            },
        });
    }

    if (kind === 'spec') {
        if (ref === undefined) {
            return err(usage_error('usage: suspec show spec <id|path>'));
        }
        // Resolve by frontmatter id (`SPEC-x`), the bare slug, the dir-slug path, or a confined
        // workspace-relative path — a `../` ref can never read outside the workspace (resolve_spec_path
        // only returns paths inside it).
        const path = resolve_spec_path(workspaceDir, ref);
        if (path === null) {
            return err(usage_error(`cannot resolve spec: ${ref}`));
        }
        const specSource = readFileSync(path, 'utf8');
        const parsed = parse_spec_record({ source: specSource, path });
        if (isErr(parsed)) {
            return err(parsed.error);
        }
        const record = parsed.value;
        return ok({
            level: 'clean',
            kind: 'spec',
            value: {
                frontmatter: record.frontmatter,
                // The compact projection: id + line + the named verify command per requirement (the
                // C013-relevant fields). The raw body/links are intentionally omitted from the default.
                requirements: record.requirements.map((r) => ({
                    id: r.id,
                    line: r.line,
                    verifyCommand: r.verifyCommand,
                })),
                sectionTitles: record.sectionTitles,
                openQuestionsPresent: record.openQuestionsPresent,
                // The append-only `## Execution` run-record (ADR-0103/0104) — the durable history of each
                // change cycle once tasks/reviews are ephemeral. Raw section text, or null when absent.
                execution: section_body(specSource, 'Execution'),
            },
        });
    }

    if (kind === 'review') {
        if (ref === undefined) {
            return err(usage_error('usage: suspec show review <stem>'));
        }
        if (!is_safe_segment(ref)) {
            return err(usage_error(`invalid review stem: ${ref}`));
        }
        const path = join(workspaceDir, 'reviews', `${ref}.md`);
        if (!existsSync(path)) {
            return err(usage_error(`no reviews/${ref}.md in this workspace`));
        }
        const reviewSource = readFileSync(path, 'utf8');
        const packet = parse_review_packet(reviewSource);
        return ok({
            level: 'clean',
            kind: 'review',
            value: {
                ...packet,
                // The review's identity + staleness provenance from frontmatter (parse_review_packet reads
                // only `status`): which spec/task it reviews (review-to-spec, ADR-0103 — `spec:` for the 1:1
                // task-less case), and the fast-track pins (ADR-0107) `reviewed_sha` + `evidence_hash` a
                // loader needs to detect a stale review. Each is null when the key is absent.
                frontmatter: {
                    status: frontmatter_value(reviewSource, 'status'),
                    spec: frontmatter_value(reviewSource, 'spec'),
                    task: frontmatter_value(reviewSource, 'task'),
                    pr: frontmatter_value(reviewSource, 'pr'),
                    reviewedSha: frontmatter_value(reviewSource, 'reviewed_sha'),
                    evidenceHash: frontmatter_value(reviewSource, 'evidence_hash'),
                },
            },
        });
    }

    return err(
        usage_error(
            `unknown show kind: ${kind} (expected task | spec | review | checks — or a file path, e.g. \`suspec show specs/foo/spec.md\`)`
        )
    );
}
