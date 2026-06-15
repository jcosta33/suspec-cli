// Resolve a finished run's reconcile inputs from a task id/slug (M2, AC-017): the task packet, its
// source spec, its review packet (if one exists), and its worktree's net change against its base
// branch. Read-only — it reads the workspace + git and assembles the data the reconcile engine
// (reconcile_review) consumes, so the direct command and the interactive flow share one resolver and
// call the SAME engine (AC-027). Writes nothing.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import {
    current_branch,
    worktree_list,
    find_worktree_for_branch,
    worktree_changed_files,
} from '../../Workspace/useCases/index.ts';
import type { ReconcileReviewInput } from './reconcileReview.ts';
import { usage_error } from './unixOutcome.ts';

export type ResolveReviewRunInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    task: string;
    base?: string; // explicit base branch override; else the repo's current branch, else `main`
}>;

// Read the frontmatter scalar `key:` from a markdown file's leading fence (a one-key scan — the
// reconcile engine owns the real parsing). Matches a task packet's `source:` and a review's `task:`.
function frontmatter_value(source: string, key: string): string | null {
    const lines = source.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return null;
    }
    const inline = new RegExp(`^${key}:\\s*(.+)$`);
    const bare = new RegExp(`^${key}:\\s*$`);
    for (let index = 1; index < lines.length && lines[index] !== '---'; index += 1) {
        const match = inline.exec(lines[index]);
        if (match !== null) {
            return match[1].trim();
        }
        // A block list (`source:` then `- SPEC-x`): take the first item.
        if (bare.test(lines[index])) {
            const item = /^\s*-\s+(.*)$/.exec(lines[index + 1] ?? '');
            return item !== null ? item[1].trim().split(/\s+/)[0] : null;
        }
    }
    return null;
}

// The source spec for a task: the specs/*/spec.md whose frontmatter id matches the packet's `source:`
// spec id. Returns the path + enclosing slug (the worktree branch's spec segment, ADR-0046).
function find_source_spec(workspaceDir: string, specId: string): { path: string; slug: string } | null {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return null;
    }
    for (const slug of readdirSync(specsDir).sort()) {
        const specPath = join(specsDir, slug, 'spec.md');
        if (existsSync(specPath) && frontmatter_value(readFileSync(specPath, 'utf8'), 'id') === specId) {
            return { path: specPath, slug };
        }
    }
    return null;
}

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

// The task's worktree path. The branch follows `swarm/<spec-slug>/<task-slug>` (ADR-0046); the
// task-slug is the task id minus a leading `TASK-`, lower-cased. Falls back to the lone swarm worktree
// whose branch's final segment matches, so an unconventional layout still resolves. Null = none.
function resolve_worktree(repoRoot: string, specSlug: string, taskId: string): string | null {
    const taskSlug = taskId.replace(/^TASK-/i, '').toLowerCase();
    const direct = find_worktree_for_branch(`swarm/${specSlug}/${taskSlug}`, repoRoot);
    if (direct !== null) {
        return direct;
    }
    const matches = worktree_list(repoRoot).filter(
        (entry) => entry.branch !== null && entry.branch.split('/').pop() === taskSlug
    );
    return matches.length === 1 ? matches[0].path : null;
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

    const worktreePath = resolve_worktree(input.repoRoot, spec.slug, input.task);
    if (worktreePath === null) {
        return err(usage_error(`no worktree found for ${input.task} — launch the run before reviewing it`));
    }

    // The diff base: an explicit `--base`, else the REPO ROOT's current branch (not a per-worktree
    // recorded fork point), else `main`. worktree_changed_files uses a three-dot `base...HEAD`, so the
    // merge-base makes this correct for the common layout (repo root on the trunk the run forked from);
    // an unusual repo-root checkout is what `--base` is for.
    const base = input.base ?? current_branch(input.repoRoot) ?? 'main';
    const diff = worktree_changed_files(worktreePath, base);
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
