import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type WorktreeInfo = {
    path: string;
    head: string | null;
    branch: string | null;
    bare: boolean;
};

export type WorktreeCreateError = AppError<
    'WorktreeCreateFailed',
    { worktreePath: string; branch: string; baseBranch: string; stderr: string }
>;
export type WorktreeCreateResult = Result<{ path: string; branch: string }, WorktreeCreateError>;

export type WorktreeRemoveError = AppError<'WorktreeRemoveFailed', { worktreePath: string; force: boolean; stderr: string }>;
export type WorktreeRemoveResult = Result<{ path: string }, WorktreeRemoveError>;

export type WorktreePruneError = AppError<'WorktreePruneFailed', { stderr: string }>;
export type WorktreePruneResult = Result<void, WorktreePruneError>;

export type NoGitRepoError = AppError<'NoGitRepo', { cwd: string }>;

// Run a git command and return trimmed stdout; throws on failure (callers that need to react use
// the Result-returning wrappers below).
function git(args: string[], opts: { cwd?: string } = {}): string {
    const result = spawnSync('git', args, { cwd: opts.cwd, encoding: 'utf8' });
    if (result.error) {
        throw new Error(`git error: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error((result.stderr || '').trim() || `git ${args[0]} failed`);
    }
    return (result.stdout || '').trim();
}

function git_available(): boolean {
    return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
}

/**
 * Resolve the git repo root without throwing — the Unix-contract seam (AC-002): a command run
 * outside a git repo gets a clean error and exit 2, never a stack trace.
 */
export function resolve_repo_root(cwd: string = process.cwd()): Result<string, NoGitRepoError> {
    if (!git_available()) {
        return err(createAppError('NoGitRepo', 'git is not installed or not in PATH', { cwd }));
    }
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
        return err(createAppError('NoGitRepo', 'not inside a git repository', { cwd }));
    }
    return ok((result.stdout || '').trim());
}

/**
 * The repo's current branch (the default base for a new worktree), or null if detached/unborn.
 */
export function current_branch(repoRoot: string): string | null {
    const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) {
        return null;
    }
    const branch = (result.stdout || '').trim();
    return branch.length > 0 && branch !== 'HEAD' ? branch : null;
}

/**
 * Parse `git worktree list --porcelain` into an array of worktrees.
 */
export function worktree_list(repoRoot: string): WorktreeInfo[] {
    let raw: string;
    try {
        raw = git(['worktree', 'list', '--porcelain'], { cwd: repoRoot });
    } catch {
        return [];
    }
    const worktrees: WorktreeInfo[] = [];
    let current: WorktreeInfo | null = null;
    for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
            if (current) {
                worktrees.push(current);
            }
            current = { path: line.slice(9), head: null, branch: null, bare: false };
        } else if (line.startsWith('HEAD ') && current) {
            current.head = line.slice(5);
        } else if (line.startsWith('branch ') && current) {
            current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line === 'bare' && current) {
            current.bare = true;
        }
    }
    if (current) {
        worktrees.push(current);
    }
    return worktrees;
}

/**
 * Whether a local branch exists.
 */
export function branch_exists(branch: string, repoRoot: string): boolean {
    return spawnSync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { cwd: repoRoot, encoding: 'utf8' }).status === 0;
}

/**
 * The worktree (if any) that has a given branch checked out.
 */
export function find_worktree_for_branch(branch: string, repoRoot: string): string | null {
    const found = worktree_list(repoRoot).find((w) => w.branch === branch);
    return found ? found.path : null;
}

/**
 * Create a worktree. Attaches `branch` if it exists, else creates it from `baseBranch`.
 */
export function worktree_create(worktreePath: string, branch: string, baseBranch: string, repoRoot: string): WorktreeCreateResult {
    const args = branch_exists(branch, repoRoot)
        ? ['worktree', 'add', worktreePath, branch]
        : ['worktree', 'add', '-b', branch, worktreePath, baseBranch];
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    if (result.error) {
        return err(
            createAppError(
                'WorktreeCreateFailed',
                `git worktree add failed: ${result.error.message}`,
                { worktreePath, branch, baseBranch, stderr: result.error.message },
                result.error
            )
        );
    }
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `git worktree add exited with status ${String(result.status)}`;
        return err(
            createAppError('WorktreeCreateFailed', `failed to create worktree "${worktreePath}" for "${branch}": ${stderr}`, {
                worktreePath,
                branch,
                baseBranch,
                stderr,
            })
        );
    }
    return ok({ path: worktreePath, branch });
}

/**
 * Remove a worktree (force if requested).
 */
export function worktree_remove(worktreePath: string, force: boolean, repoRoot: string): WorktreeRemoveResult {
    const args = force ? ['worktree', 'remove', '--force', worktreePath] : ['worktree', 'remove', worktreePath];
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
    if (result.error) {
        return err(
            createAppError(
                'WorktreeRemoveFailed',
                `git worktree remove failed: ${result.error.message}`,
                { worktreePath, force, stderr: result.error.message },
                result.error
            )
        );
    }
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `git worktree remove exited with status ${String(result.status)}`;
        return err(createAppError('WorktreeRemoveFailed', `failed to remove worktree "${worktreePath}": ${stderr}`, { worktreePath, force, stderr }));
    }
    return ok({ path: worktreePath });
}

/**
 * Run `git worktree prune`.
 */
export function worktree_prune(repoRoot: string): WorktreePruneResult {
    try {
        git(['worktree', 'prune'], { cwd: repoRoot });
        return ok(undefined);
    } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);
        return err(createAppError('WorktreePruneFailed', `git worktree prune failed: ${message}`, { stderr: message }));
    }
}

/**
 * Whether a worktree has uncommitted changes.
 */
export function is_worktree_dirty(worktreePath: string): boolean {
    if (!existsSync(worktreePath)) {
        return false;
    }
    const result = spawnSync('git', ['status', '--porcelain'], { cwd: worktreePath, encoding: 'utf8' });
    if (result.status !== 0) {
        return false;
    }
    return (result.stdout || '').trim().length > 0;
}
