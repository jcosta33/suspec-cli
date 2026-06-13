// LaunchEngine.remove (AC-009): tear down a task worktree by spec/task slug. Refuses a dirty
// worktree unless --force (the underlying git behaviour). No agent.

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { find_worktree_for_branch, worktree_remove } from '../../Workspace/useCases/index.ts';
import { derive_worktree_names } from '../services/worktreeNames.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type RemoveWorktreeInput = Readonly<{
    repoRoot: string;
    specSlug: string;
    taskSlug?: string;
    force: boolean;
}>;

export type RemoveWorktreeReport = Readonly<{
    level: OutcomeLevel;
    branch: string;
    worktreePath: string;
}>;

export function remove_worktree(input: RemoveWorktreeInput): Result<RemoveWorktreeReport, AppError> {
    const { branch } = derive_worktree_names(input);

    const path = find_worktree_for_branch(branch, input.repoRoot);
    if (path === null) {
        return err(createAppError('WorktreeNotFound', `no worktree on branch ${branch}`, { branch }));
    }

    const removed = worktree_remove(path, input.force, input.repoRoot);
    if (isErr(removed)) {
        return err(removed.error);
    }
    return ok({ level: 'clean', branch, worktreePath: path });
}
