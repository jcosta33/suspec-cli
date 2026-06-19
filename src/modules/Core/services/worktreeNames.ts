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

export function derive_worktree_names(input: DeriveWorktreeNamesInput): WorktreeNames {
    const hasTask = input.taskSlug !== undefined && input.taskSlug.length > 0;
    const branch = hasTask ? `swarm/${input.specSlug}/${input.taskSlug}` : `swarm/${input.specSlug}`;
    // Join the two slugs with `~`, a char `is_safe_segment` forbids in a slug, so the boundary is
    // unambiguous: (auth, login-form) → `auth~login-form` and (auth-login, form) → `auth-login~form`
    // get distinct dirs, where a flat `-` join collided on `auth-login-form` (#25). A separator (not a
    // `<spec>/<task>` nest) keeps the dirs flat siblings, so a whole-spec worktree never contains a
    // task worktree (git refuses a worktree nested inside another's tree).
    const dirName = hasTask ? `${input.specSlug}~${input.taskSlug}` : input.specSlug;
    return { branch, worktreePath: join(input.repoRoot, '.worktrees', dirName) };
}
