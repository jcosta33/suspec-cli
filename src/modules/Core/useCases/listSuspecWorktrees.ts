// LaunchEngine.list (AC-009): list the suspec-managed worktrees (those on a suspec/* branch),
// with each one's dirtiness for the operator. Read-only.

import { worktree_list, is_worktree_dirty } from '../../Workspace/useCases/index.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type SuspecWorktree = Readonly<{
    path: string;
    branch: string;
    dirty: boolean;
}>;

export type ListSuspecWorktreesReport = Readonly<{
    level: OutcomeLevel;
    worktrees: readonly SuspecWorktree[];
}>;

export function list_suspec_worktrees(repoRoot: string): ListSuspecWorktreesReport {
    const worktrees = worktree_list(repoRoot)
        .filter((entry): entry is typeof entry & { branch: string } => entry.branch?.startsWith('suspec/') === true)
        .map((entry) => ({ path: entry.path, branch: entry.branch, dirty: is_worktree_dirty(entry.path) }));
    return { level: 'clean', worktrees };
}
