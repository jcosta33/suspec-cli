// LaunchEngine.list (AC-009): list the corpus-managed worktrees (those on a corpus/* branch),
// with each one's dirtiness for the operator. Read-only.

import { worktree_list, is_worktree_dirty } from '../../Workspace/useCases/index.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CorpusWorktree = Readonly<{
    path: string;
    branch: string;
    dirty: boolean;
}>;

export type ListCorpusWorktreesReport = Readonly<{
    level: OutcomeLevel;
    worktrees: readonly CorpusWorktree[];
}>;

export function list_corpus_worktrees(repoRoot: string): ListCorpusWorktreesReport {
    const worktrees = worktree_list(repoRoot)
        .filter((entry): entry is typeof entry & { branch: string } => entry.branch?.startsWith('corpus/') === true)
        .map((entry) => ({ path: entry.path, branch: entry.branch, dirty: is_worktree_dirty(entry.path) }));
    return { level: 'clean', worktrees };
}
