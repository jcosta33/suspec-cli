// LaunchEngine.list (AC-009): list the swarm-managed worktrees (those on a swarm/* branch),
// with each one's dirtiness for the operator. Read-only.

import { worktree_list, is_worktree_dirty } from '../../Workspace/useCases/index.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type SwarmWorktree = Readonly<{
    path: string;
    branch: string;
    dirty: boolean;
}>;

export type ListSwarmWorktreesReport = Readonly<{
    level: OutcomeLevel;
    worktrees: readonly SwarmWorktree[];
}>;

export function list_swarm_worktrees(repoRoot: string): ListSwarmWorktreesReport {
    const worktrees = worktree_list(repoRoot)
        .filter((entry): entry is typeof entry & { branch: string } => entry.branch !== null && entry.branch.startsWith('swarm/'))
        .map((entry) => ({ path: entry.path, branch: entry.branch, dirty: is_worktree_dirty(entry.path) }));
    return { level: 'clean', worktrees };
}
