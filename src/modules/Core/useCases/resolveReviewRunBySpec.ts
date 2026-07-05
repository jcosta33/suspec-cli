// Resolve a finished run's reconcile inputs from a SPEC, with no task (review-to-spec, ADR-0103). The
// task-less 1:1 review: coverage keys on the spec's full ACs and the self-report is read from the spec's
// `## Execution` (reconcile_review does both when taskPacketSource is null). The diff comes from the
// code repo named by `--repo` (or the workspace's own repo) against `--base` — NO worktree inference,
// since a 1:1 layout has no per-task branch (the dedicated-workspace guidance, ADR-0100). Read-only.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { current_branch, worktree_changed_files, worktree_changed_stats } from '../../Workspace/useCases/index.ts';
import { frontmatter_value, find_source_spec } from './taskLocator.ts';
import type { ReconcileReviewInput } from './reconcileReview.ts';
import { usage_error } from './unixOutcome.ts';
import { is_safe_segment } from '../services/safeSegment.ts';

export type ResolveReviewRunBySpecInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    spec: string; // a SPEC id or a spec dir slug
    base?: string;
}>;

// Resolve a spec by frontmatter id (preferred) or by dir slug (`specs/<slug>/spec.md`). Returns the
// canonical id + the source, or null when neither resolves.
function find_spec_by_ref(workspaceDir: string, ref: string): { id: string; source: string } | null {
    const byId = find_source_spec(workspaceDir, ref);
    if (byId !== null) {
        return { id: ref, source: readFileSync(byId.path, 'utf8') };
    }
    const bySlug = join(workspaceDir, 'specs', ref, 'spec.md');
    if (is_safe_segment(ref) && existsSync(bySlug)) {
        const source = readFileSync(bySlug, 'utf8');
        return { id: frontmatter_value(source, 'id') ?? ref, source };
    }
    return null;
}

// The review packet (if any) that names this spec directly via `spec:` frontmatter.
function find_review_by_spec(workspaceDir: string, specId: string): string | null {
    const reviewsDir = join(workspaceDir, 'reviews');
    if (!existsSync(reviewsDir)) {
        return null;
    }
    for (const name of readdirSync(reviewsDir).sort()) {
        if (!name.endsWith('.md')) {
            continue;
        }
        const source = readFileSync(join(reviewsDir, name), 'utf8');
        if (frontmatter_value(source, 'spec') === specId) {
            return source;
        }
    }
    return null;
}

export function resolve_review_run_by_spec(input: ResolveReviewRunBySpecInput): Result<ReconcileReviewInput, AppError> {
    const spec = find_spec_by_ref(input.workspaceDir, input.spec);
    if (spec === null) {
        return err(
            usage_error(
                `cannot review ${input.spec}: no task and no spec with that id or slug. ` +
                    `For a 1:1 review, pass a SPEC id/slug and point at the code with \`--repo <path>\`.`
            )
        );
    }
    // The diff base: explicit `--base`, else the code repo's current branch, else `main`. The diff runs
    // in the code repo (`--repo`, resolved by the command into repoRoot), not a per-task worktree.
    const base = input.base ?? current_branch(input.repoRoot) ?? 'main';
    const diff = worktree_changed_files(input.repoRoot, base);
    if (isErr(diff)) {
        return err(diff.error);
    }
    const statsResult = worktree_changed_stats(input.repoRoot, base);

    return ok({
        task: spec.id, // the label carried into the report (a spec id, no task)
        taskPacketSource: null, // the task-less marker — reconcile_review keys on the spec
        specSource: spec.source,
        reviewPacketSource: find_review_by_spec(input.workspaceDir, spec.id),
        diffChangedFiles: diff.value,
        changedFileStats: isErr(statsResult) ? undefined : statsResult.value,
        base,
        packetRef: 'the spec (no task) — self-report read from its `## Execution`',
    });
}
