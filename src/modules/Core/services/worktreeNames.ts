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
    const dirName = hasTask ? `${input.specSlug}-${input.taskSlug}` : input.specSlug;
    return { branch, worktreePath: join(input.repoRoot, '.worktrees', dirName) };
}
