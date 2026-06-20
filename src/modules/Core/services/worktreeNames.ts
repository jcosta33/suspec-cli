// Pure derivation of a task worktree's branch + path (AC-009). The branch follows ADR-0046:
// `swarm/<spec-slug>` for a whole spec, `swarm/<spec-slug>/<task-slug>` for one task. Worktrees
// live under the repo's `.worktrees/` so they are easy to find and prune.

import { join } from 'path';

export type DeriveWorktreeNamesInput = Readonly<{
    repoRoot: string;
    specSlug: string;
    taskSlug?: string;
}>;

export type WorktreeNames = Readonly<{
    branch: string;
    worktreePath: string;
}>;

// The canonical task SLUG: the task id minus a leading `TASK-`, lower-cased — the worktree branch tail
// (ADR-0046). The ONE shared normalizer, so the PRODUCER (this service, which `swarm worktree create
// --task <t>` drives) and the CONSUMER (resolve_worktree, which review/run drive off the task id) derive
// the same tail: `--task TASK-Feat` and a lookup of `TASK-Feat` both land on `swarm/<spec>/feat`. Without
// this the producer wrote the raw `--task` verbatim and the consumer normalized — so review/run never
// found a worktree created from a `TASK-`-prefixed or mixed-case `--task` (the blind field-test blocker).
export function task_slug(taskId: string): string {
    return taskId.replace(/^TASK-/i, '').toLowerCase();
}

export function derive_worktree_names(input: DeriveWorktreeNamesInput): WorktreeNames {
    // Normalize ONCE at the top, so the branch tail AND the dir name share the canonical slug and can
    // never drift from each other or from what the consumer-side resolve_worktree computes.
    const slug = input.taskSlug !== undefined ? task_slug(input.taskSlug) : undefined;
    const hasTask = slug !== undefined && slug.length > 0;
    const branch = hasTask ? `swarm/${input.specSlug}/${slug}` : `swarm/${input.specSlug}`;
    // Join the two slugs with `~`, a char `is_safe_segment` forbids in a slug, so the boundary is
    // unambiguous: (auth, login-form) → `auth~login-form` and (auth-login, form) → `auth-login~form`
    // get distinct dirs, where a flat `-` join collided on `auth-login-form` (#25). A separator (not a
    // `<spec>/<task>` nest) keeps the dirs flat siblings, so a whole-spec worktree never contains a
    // task worktree (git refuses a worktree nested inside another's tree).
    const dirName = hasTask ? `${input.specSlug}~${slug}` : input.specSlug;
    return { branch, worktreePath: join(input.repoRoot, '.worktrees', dirName) };
}
