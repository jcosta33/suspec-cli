// LaunchEngine.create (AC-009): create an isolated worktree on swarm/<spec-slug>[/<task-slug>] off
// the base branch. Idempotent-ish — if the branch already has a worktree, return it (reused) rather
// than failing or duplicating. No agent (AC-014): this is pure git orchestration.

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { find_worktree_for_branch, worktree_create } from '../../Workspace/useCases/index.ts';
import { derive_worktree_names } from '../services/worktreeNames.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CreateWorktreeInput = Readonly<{
    repoRoot: string;
    specSlug: string;
    taskSlug?: string;
    baseBranch: string;
}>;

export type CreateWorktreeReport = Readonly<{
    level: OutcomeLevel;
    branch: string;
    worktreePath: string;
    reused: boolean;
}>;

export function create_worktree(input: CreateWorktreeInput): Result<CreateWorktreeReport, AppError> {
    const { branch, worktreePath } = derive_worktree_names(input);

    const existing = find_worktree_for_branch(branch, input.repoRoot);
    if (existing !== null) {
        return ok({ level: 'clean', branch, worktreePath: existing, reused: true });
    }

    const created = worktree_create(worktreePath, branch, input.baseBranch, input.repoRoot);
    if (isErr(created)) {
        return err(created.error);
    }
    return ok({ level: 'clean', branch, worktreePath: created.value.path, reused: false });
}
