// Resolve a finished run's reconcile inputs from a task id/slug (M2, AC-017): the task packet, its
// source spec, its review packet (if one exists), and its worktree's net change against its base
// branch. Read-only — it reads the workspace + git and assembles the data the reconcile engine
// (reconcile_review) consumes, so the direct command and the interactive flow share one resolver and
// call the SAME engine (AC-027). Writes nothing.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { current_branch, worktree_changed_files } from '../../Workspace/useCases/index.ts';
import { frontmatter_value, find_source_spec, resolve_worktree } from './taskLocator.ts';
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
    const taskPath = join(input.workspaceDir, 'tasks', `${input.task}.md`);
    if (!existsSync(taskPath)) {
        return err(
            createAppError('NoWorkspace', `cannot review ${input.task}: no tasks/${input.task}.md in this workspace`, {
                capability: `reviewing ${input.task}`,
            })
        );
    }
    const taskPacketSource = readFileSync(taskPath, 'utf8');

    const specId = frontmatter_value(taskPacketSource, 'source');
    const spec = specId !== null ? find_source_spec(input.workspaceDir, specId) : null;
    if (spec === null) {
        return err(usage_error(`cannot resolve the source spec for ${input.task} (source: ${specId ?? 'none'})`));
    }

    const worktree = resolve_worktree(input.repoRoot, spec.slug, input.task);
    if (worktree === null) {
        return err(usage_error(`no worktree found for ${input.task} — launch the run before reviewing it`));
    }

    // The diff base: an explicit `--base`, else the REPO ROOT's current branch (not a per-worktree
    // recorded fork point), else `main`. worktree_changed_files uses a three-dot `base...HEAD`, so the
    // merge-base makes this correct for the common layout (repo root on the trunk the run forked from);
    // an unusual repo-root checkout is what `--base` is for.
    const base = input.base ?? current_branch(input.repoRoot) ?? 'main';
    const diff = worktree_changed_files(worktree.path, base);
    if (isErr(diff)) {
        return err(diff.error);
    }

    return ok({
        task: input.task,
        taskPacketSource,
        specSource: readFileSync(spec.path, 'utf8'),
        reviewPacketSource: find_review_packet(input.workspaceDir, input.task),
        diffChangedFiles: diff.value,
    });
}
