// LaunchEngine.prune (AC-009): clear administrative entries for worktrees whose directory is gone
// (`git worktree prune`). No agent.

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { worktree_prune } from '../../Workspace/useCases/index.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type PruneWorktreesReport = Readonly<{
    level: OutcomeLevel;
}>;

export function prune_worktrees(repoRoot: string): Result<PruneWorktreesReport, AppError> {
    const pruned = worktree_prune(repoRoot);
    if (isErr(pruned)) {
        return err(pruned.error);
    }
    return ok({ level: 'clean' });
}
