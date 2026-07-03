// Resolve a finished run's reconcile inputs from a task id/slug (M2, AC-017): the task packet, its
// source spec, its review packet (if one exists), and its worktree's net change against its base
// branch. Read-only — it reads the workspace + git and assembles the data the reconcile engine
// (reconcile_review) consumes, so the direct command and the interactive flow share one resolver and
// call the SAME engine (AC-027). Writes nothing.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import {
    current_branch,
    worktree_changed_files,
    worktree_changed_stats,
    branch_merged_into,
    paths_changed_since,
} from '../../Workspace/useCases/index.ts';
import { frontmatter_value, find_source_spec, resolve_worktree, resolve_task } from './taskLocator.ts';
import { task_slug } from '../services/worktreeNames.ts';
import type { ReconcileReviewInput } from './reconcileReview.ts';
import { usage_error } from './unixOutcome.ts';

export type ResolveReviewRunInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    task: string;
    base?: string; // explicit base branch override; else the repo's current branch, else `main`
}>;

// The review packet (if any) for a task: the reviews/*.md whose frontmatter `task:` matches the id.
function find_review_packet(workspaceDir: string, taskId: string): string | null {
    const reviewsDir = join(workspaceDir, 'reviews');
    if (!existsSync(reviewsDir)) {
        return null;
    }
    for (const name of readdirSync(reviewsDir).sort()) {
        if (!name.endsWith('.md')) {
            continue;
        }
        const source = readFileSync(join(reviewsDir, name), 'utf8');
        if (frontmatter_value(source, 'task') === taskId) {
            return source;
        }
    }
    return null;
}

export function resolve_review_run(input: ResolveReviewRunInput): Result<ReconcileReviewInput, AppError> {
    // Resolve the task by either the bare slug or the TASK- id to its canonical file + frontmatter `id`
    // (so `suspec review pastebin` and `suspec review TASK-pastebin` both work without a rename).
    const task = resolve_task(input.workspaceDir, input.task);
    if (task === null) {
        return err(
            createAppError(
                'NoWorkspace',
                `cannot review ${input.task}: no matching tasks/${input.task}.md (or tasks/TASK-${input.task}.md) in this workspace`,
                { capability: `reviewing ${input.task}` }
            )
        );
    }
    const taskPacketSource = task.source;

    const specId = frontmatter_value(taskPacketSource, 'source');
    const spec = specId !== null ? find_source_spec(input.workspaceDir, specId) : null;
    if (spec === null) {
        return err(usage_error(`cannot resolve the source spec for ${input.task} (source: ${specId ?? 'none'})`));
    }

    const worktree = resolve_worktree(input.repoRoot, spec.slug, task.id);
    if (worktree === null) {
        const tail = task_slug(task.id);
        return err(
            usage_error(
                // The suggestion must name the per-task branch this review looks for. The old message
                // suggested `suspec worktree create ${spec.slug}` (the whole-spec form), which git refuses
                // once any `suspec/${spec.slug}/<task>` ref exists (a ref can't be both a leaf and a
                // directory) — so following it was impossible (SW-005). Spell the exact --task form.
                `no worktree found for ${task.id} — create it with ` +
                    `\`suspec worktree create ${spec.slug} --task ${tail}\` first ` +
                    `(that makes the branch \`suspec/${spec.slug}/${tail}\` this review reconciles against). ` +
                    `If the code lives in a separate repo from this workspace, point the review at it with ` +
                    `\`suspec review ${input.task} --repo <path-to-code-repo>\`. ` +
                    `If the task already MERGED and its worktree was removed: staleness pins and the reconcile ` +
                    `need the pre-merge diff — review before merging next time; the merged run cannot be ` +
                    `reconstructed here.`
            )
        );
    }

    // SW-004: the self-report under review is the BRANCH's copy of the packet — the worker fills the
    // `## Run summary` (and the real Affected areas / Verify edits) inside the worktree, while the
    // workspace checkout still holds the blank cut packet until merge. Reconciling the workspace copy
    // silently no-ops the self-report ("run summary lists no machine-checkable file paths"). When the
    // worktree carries its own copy of the packet (the co-located layout), reconcile THAT; otherwise
    // keep the workspace copy (split-repo, where the worktree is code-only and has no tasks/).
    const relTaskPath = relative(input.workspaceDir, task.path);
    const worktreePacketPath = join(worktree.path, relTaskPath);
    const readFromWorktree = worktreePacketPath !== task.path && existsSync(worktreePacketPath);
    const reviewedPacketSource = readFromWorktree ? readFileSync(worktreePacketPath, 'utf8') : taskPacketSource;

    // Resolve the spec the reconcile checks against from the SAME (reviewed) packet whose scope + claims
    // it reads, so spec and scope are never lifted from two different copies of the packet. The worktree
    // lookup above used the workspace copy's source to FIND the branch (and falls back when it differs);
    // for the reconcile, prefer the reviewed packet's declared spec when it resolves, else keep that spec.
    const reviewedSpecId = frontmatter_value(reviewedPacketSource, 'source');
    const reviewedSpec = reviewedSpecId !== null ? find_source_spec(input.workspaceDir, reviewedSpecId) : null;
    const specForReconcile = reviewedSpec ?? spec;

    // The diff base: an explicit `--base`, else the REPO ROOT's current branch (not a per-worktree
    // recorded fork point), else `main`. worktree_changed_files uses a three-dot `base...HEAD`, so the
    // merge-base makes this correct for the common layout (repo root on the trunk the run forked from);
    // an unusual repo-root checkout is what `--base` is for.
    const base = input.base ?? current_branch(input.repoRoot) ?? 'main';
    const diff = worktree_changed_files(worktree.path, base);
    if (isErr(diff)) {
        return err(diff.error);
    }
    // The task packet you are reviewing is the review's INPUT, not code under review. In the co-located
    // layout the worker fills its Run summary inside the worktree, so that edit shows in the diff — drop
    // the packet's own path so it is not mis-flagged as an outside-scope / changed-not-claimed code change
    // (SW-004; in split-repo the worktree has no packet, so this is a no-op).
    const diffChangedFiles = diff.value.filter((path) => path !== relTaskPath);

    // First-hour trap guard (suspec-works #87/#91): an empty diff on a branch already MERGED into
    // the base means every claim would read claimed-not-changed — reconciling that emptiness is
    // noise dressed as review. Refuse upfront with the way out; a fresh worktree with no commits
    // (HEAD at the base tip) is NOT refused — that is "no work yet", reconciled normally.
    if (diffChangedFiles.length === 0 && branch_merged_into(worktree.path, base)) {
        return err(
            usage_error(
                `branch "${worktree.branch ?? 'HEAD'}" is already merged into "${base}" — its diff is empty, so this reconcile would read every claim as claimed-not-changed. ` +
                    `Review a branch BEFORE merging it; for an already-merged run, pass \`--base <the branch's fork point>\` to reconcile the pre-merge diff.`
            )
        );
    }

    // C018 (oversized-packet): the per-file LOC of the committed diff. Same packet-path exclusion as
    // above. An Err here is non-fatal — the size nudge is advisory, so a numstat hiccup degrades to "no
    // size signal" rather than failing the whole reconcile (the name-only diff already succeeded).
    const statsResult = worktree_changed_stats(worktree.path, base);
    const changedFileStats = isErr(statsResult)
        ? undefined
        : statsResult.value.filter((stat) => stat.path !== relTaskPath);

    return ok({
        task: task.id,
        taskPacketSource: reviewedPacketSource,
        specSource: readFileSync(specForReconcile.path, 'utf8'),
        // Match the review by the task's canonical frontmatter `id` (the SAME key `suspec status` matches),
        // not the raw CLI arg — so `suspec review` and `suspec status` agree on one `task:` value rather than
        // demanding opposite forms in the same field.
        reviewPacketSource: find_review_packet(input.workspaceDir, task.id),
        diffChangedFiles,
        changedFileStats,
        // #97 (ADR-0107): let the reconcile detect post-review CONTENT drift the digest misses — the
        // paths that differ between the review's `reviewed_sha` and this worktree.
        pathsChangedSince: (sha: string) => paths_changed_since(worktree.path, sha),
        // Context the command surfaces (the reconcile engine ignores these). packetRef names WHERE the
        // self-report was read from (R5-I06 — the worktree branch under review, or the workspace checkout
        // in a split-repo layout), so a worker who edited the wrong copy sees why the reconcile differs.
        base,
        packetRef:
            readFromWorktree && worktree.branch !== null
                ? `the worktree branch ${worktree.branch}`
                : 'this workspace checkout',
    });
}
