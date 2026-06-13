

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { basename } from 'path';

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

export type WorktreeRemoveError = AppError<
    'WorktreeRemoveFailed',
    { worktreePath: string; force: boolean; stderr: string }
>;

export type WorktreeRemoveResult = Result<{ path: string }, WorktreeRemoveError>;

export type DeleteBranchError = AppError<
    'DeleteBranchFailed',
    { branch: string; force: boolean; stderr: string }
>;

export type DeleteBranchResult = Result<{ branch: string }, DeleteBranchError>;

/**
 * Run a git command and return stdout as string.
 */
function git(args: string[], opts: { cwd?: string } = {}): string {
    const result = spawnSync('git', args, {
        cwd: opts.cwd,
        encoding: 'utf8',
    });
    if (result.error) throw new Error(`git error: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error((result.stderr || "").trim() || `git ${args[0]} failed`);
    }
    return (result.stdout || "").trim();
}

/**
 * Find the root of the current git repository.
 */
export function get_repo_root(): string {
    if (!git_available()) {
        throw new Error('git is not installed or not in PATH.');
    }
    try {
        return git(['rev-parse', '--show-toplevel']);
    } catch {
        throw new Error('Not inside a git repository. Run this command from within the repo.');
    }
}

export type NoGitRepoError = AppError<'NoGitRepo', { cwd: string }>;

/**
 * Resolve the git repo root without throwing — the Unix-contract seam (AC-002): a command run
 * outside a git repo gets a clean error and exit 2, never a stack trace. Prefer this over
 * get_repo_root in the M1 engines.
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
 * Get the repo directory name (used for worktree path patterns).
 */
export function get_repo_name(repoRoot: string): string {
    return basename(repoRoot);
}

/**
 * Parse `git worktree list --porcelain` output into an array of objects.
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
            if (current) worktrees.push(current);
            current = { path: line.slice(9), head: null, branch: null, bare: false };
        } else if (line.startsWith('HEAD ') && current) {
            current.head = line.slice(5);
        } else if (line.startsWith('branch ') && current) {
            current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line === 'bare' && current) {
            current.bare = true;
        }
    }
    if (current) worktrees.push(current);
    return worktrees;
}

/**
 * Check if a local branch exists.
 */
export function branch_exists(branch: string, repoRoot: string): boolean {
    const result = spawnSync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    return result.status === 0;
}

/**
 * Find which worktree (if any) has a given branch checked out.
 */
export function find_worktree_for_branch(branch: string, repoRoot: string): string | null {
    const list = worktree_list(repoRoot);
    const found = list.find((w) => w.branch === branch);
    return found ? found.path : null;
}

/**
 * Create a new worktree. If `branch` already exists, attaches it; otherwise
 * creates it from `baseBranch`. Returns a `Result` so callers can react to
 * failure (path already a worktree, branch checked out elsewhere, missing
 * base branch) without try/catch.
 */
export function worktree_create(
    worktreePath: string,
    branch: string,
    baseBranch: string,
    repoRoot: string
): WorktreeCreateResult {
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
            createAppError(
                'WorktreeCreateFailed',
                `Failed to create worktree at "${worktreePath}" for branch "${branch}": ${stderr}`,
                { worktreePath, branch, baseBranch, stderr }
            )
        );
    }
    return ok({ path: worktreePath, branch });
}

/**
 * Remove a worktree. Uses `--force` if requested. Returns a `Result` so
 * callers can distinguish "git refused" from "spawn failed" without try/catch.
 */
export function worktree_remove(worktreePath: string, force: boolean, repoRoot: string): WorktreeRemoveResult {
    const args = ['worktree', 'remove'];
    if (force) {
        args.push('--force');
    }
    args.push(worktreePath);

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
        return err(
            createAppError(
                'WorktreeRemoveFailed',
                `Failed to remove worktree at "${worktreePath}": ${stderr}`,
                { worktreePath, force, stderr }
            )
        );
    }
    return ok({ path: worktreePath });
}

export type WorktreePruneError = AppError<
    'WorktreePruneFailed',
    { stderr: string }
>;

export type WorktreePruneResult = Result<void, WorktreePruneError>;

/**
 * Run `git worktree prune`.
 */
export function worktree_prune(repoRoot: string): WorktreePruneResult {
    try {
        git(['worktree', 'prune'], { cwd: repoRoot });
        return ok(undefined);
    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return err(createAppError('WorktreePruneFailed', `git worktree prune failed: ${errorMsg}`, { stderr: errorMsg }));
    }
}

/**
 * Check if a worktree has uncommitted changes.
 */
export function is_worktree_dirty(worktreePath: string): boolean {
    if (!existsSync(worktreePath)) return false;
    const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
        encoding: 'utf8',
    });
    if (result.status !== 0) return false;
    return (result.stdout || "").trim().length > 0;
}

/**
 * Get a short git status summary for a worktree.
 */
export function get_status_summary(worktreePath: string): string {
    if (!existsSync(worktreePath)) return 'missing';
    const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: worktreePath,
        encoding: 'utf8',
    });
    if (result.status !== 0) return 'unknown';
    const lines = (result.stdout || "").trim();
    if (!lines) return 'clean';
    const count = lines.split('\n').length;
    return `dirty (${String(count)} change${count !== 1 ? 's' : ''})`;
}

/**
 * Check if a local branch is fully merged into another branch.
 */
export function is_branch_merged_into(branch: string, baseBranch: string, repoRoot: string): boolean {
    const refs = [baseBranch, `origin/${baseBranch}`];
    for (const ref of refs) {
        try {
            // A branch with 0 unique commits relative to this ref is empty, not merged
            const uniqueCount = parseInt(git(['rev-list', '--count', `${ref}..${branch}`], { cwd: repoRoot }), 10);
            if (uniqueCount === 0) continue;

            const output = git(['branch', '--merged', ref], { cwd: repoRoot });
            const merged = output.split('\n').map((l: string) => l.trim().replace(/^[*+]\s*/, ''));
            if (merged.includes(branch)) return true;
        } catch {
            // Ignore check errors and try next ref
        }
    }
    return false;
}

/**
 * Delete a local branch. Returns a `Result` — callers that want to "best
 * effort delete and warn on failure" no longer need try/catch.
 */
export function delete_branch(branch: string, repoRoot: string, force = false): DeleteBranchResult {
    const result = spawnSync('git', ['branch', force ? '-D' : '-d', branch], {
        cwd: repoRoot,
        encoding: 'utf8',
    });

    if (result.error) {
        return err(
            createAppError(
                'DeleteBranchFailed',
                `git branch delete failed: ${result.error.message}`,
                { branch, force, stderr: result.error.message },
                result.error
            )
        );
    }
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `git branch delete exited with status ${String(result.status)}`;
        return err(
            createAppError(
                'DeleteBranchFailed',
                `Failed to delete branch "${branch}": ${stderr}`,
                { branch, force, stderr }
            )
        );
    }
    return ok({ branch });
}

/**
 * List all local branches matching a prefix.
 */
export function list_branches_by_prefix(prefix: string, repoRoot: string): string[] {
    try {
        const output = git(['branch', '--list', `${prefix}*`], { cwd: repoRoot });
        return output
            .split('\n')
            .map((l: string) => l.trim().replace(/^[*+]\s*/, '')) // * = current branch, + = checked out in worktree
            .filter(Boolean);
    } catch {
        return [];
    }
}

/**
 * Check that git is available.
 */
function git_available() {
    const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
}

/**
 * Synchronize (rebase) a worktree's branch onto its base branch.
 * @returns true if successful, false if conflicts occurred
 */
export function worktree_sync(worktreePath: string, baseBranch: string): boolean {
    const result = spawnSync('git', ['rebase', baseBranch], {
        cwd: worktreePath,
        stdio: 'inherit',
        encoding: 'utf8',
    });
    return result.status === 0;
}
