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

export type WorktreeRemoveError = AppError<
    'WorktreeRemoveFailed',
    { worktreePath: string; force: boolean; stderr: string }
>;
export type WorktreeRemoveResult = Result<{ path: string }, WorktreeRemoveError>;

export type WorktreePruneError = AppError<'WorktreePruneFailed', { stderr: string }>;
export type WorktreePruneResult = Result<void, WorktreePruneError>;

export type NoGitRepoError = AppError<'NoGitRepo', { cwd: string }>;

// Run a git command and return trimmed stdout; throws on failure (callers that need to react use
// the Result-returning wrappers below).
function git(args: string[], opts: { cwd?: string } = {}): string {
    const result = spawnSync('git', args, { cwd: opts.cwd, encoding: 'utf8' });
    /* v8 ignore next 3 -- spawn-launch failure (git binary missing); not reachable where git is installed */
    if (result.error) {
        throw new Error(`git error: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error((result.stderr || '').trim() || `git ${args[0]} failed`);
    }
    return (result.stdout || '').trim();
}

/**
 * Resolve the git repo root without throwing — the Unix-contract seam (AC-002): a command run
 * outside a git repo gets a clean error and exit 2, never a stack trace. One spawn: a missing git
 * surfaces as `result.error`, a non-repo as a non-zero status.
 */
export function resolve_repo_root(cwd: string = process.cwd()): Result<string, NoGitRepoError> {
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
    /* v8 ignore next 3 -- git-not-installed guard; not reachable in an environment that has git */
    if (result.error) {
        return err(createAppError('NoGitRepo', 'git is not installed or not in PATH', { cwd }));
    }
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
 * Whether the repo has at least one commit (a resolvable HEAD). A fresh `git init` has none, so a
 * worktree cannot be created yet — the command turns this into a clear message rather than leaking a
 * raw "fatal: invalid reference" from git.
 */
export function repo_has_commits(repoRoot: string): boolean {
    return spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).status === 0;
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
    return (
        spawnSync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { cwd: repoRoot, encoding: 'utf8' })
            .status === 0
    );
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
    /* v8 ignore start -- spawn-launch failure (git binary missing); the status!==0 path below is the tested failure mode */
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
    /* v8 ignore stop */
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `git worktree add exited with status ${String(result.status)}`;
        return err(
            createAppError(
                'WorktreeCreateFailed',
                `failed to create worktree "${worktreePath}" for "${branch}": ${stderr}`,
                {
                    worktreePath,
                    branch,
                    baseBranch,
                    stderr,
                }
            )
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
    /* v8 ignore start -- spawn-launch failure (git binary missing); the status!==0 path below is the tested failure mode */
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
    /* v8 ignore stop */
    if (result.status !== 0) {
        const stderr =
            (result.stderr || '').trim() || `git worktree remove exited with status ${String(result.status)}`;
        return err(
            createAppError('WorktreeRemoveFailed', `failed to remove worktree "${worktreePath}": ${stderr}`, {
                worktreePath,
                force,
                stderr,
            })
        );
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

export type ChangedFilesError = AppError<'ChangedFilesFailed', { worktreePath: string; base: string; stderr: string }>;

// Parse `git status --porcelain` (v1) path fields. Each line is `XY <path>` (XY = two status
// columns), and a rename/copy line is `R  old -> new` — keep the destination path. Untracked files
// (`??`) are included: an uncommitted new file is part of the net change.
// Decode a git C-quoted path. `git status --porcelain` wraps a path containing a space (or other
// unusual byte) in double quotes with C-style escapes (`"src/my file.ts"`, `\t`, `\"`, `\\`, octal
// `\NNN` for control bytes — non-ASCII is shown literally because both git calls pass
// `core.quotePath=false`). `git diff --name-only` reports the same path unquoted, so without decoding the
// two sources never reconcile and a spaced/non-ASCII path is dropped or double-counted (swarm-hq #22). A
// path that is not double-quoted is returned unchanged.
function c_unquote(path: string): string {
    if (!(path.startsWith('"') && path.endsWith('"') && path.length >= 2)) {
        return path;
    }
    return path.slice(1, -1).replace(/\\([\\"tnr]|[0-7]{1,3})/g, (_match, esc: string) => {
        const named: Record<string, string> = { '\\': '\\', '"': '"', t: '\t', n: '\n', r: '\r' };
        return esc in named ? named[esc] : String.fromCharCode(parseInt(esc, 8));
    });
}

function porcelain_paths(raw: string): string[] {
    const paths: string[] = [];
    for (const line of raw.split('\n')) {
        if (line.length < 4) {
            continue;
        }
        const rest = line.slice(3); // drop the two status columns + the single space
        const arrow = rest.indexOf(' -> ');
        paths.push(c_unquote(arrow === -1 ? rest : rest.slice(arrow + 4)));
    }
    return paths;
}

/**
 * The worktree's net change against its base branch — committed since divergence AND uncommitted —
 * as a sorted, de-duplicated list of repo-relative paths (name-only). A bad base ref / branch (one
 * git cannot resolve) returns an Err so the command exits 2, never a stack trace (AC-018).
 *
 * Two sources are unioned:
 *   1. `git diff --name-only <base>...HEAD` — files changed in commits since the worktree branched
 *      off `base` (three-dot diffs against the merge-base, so unrelated base movement is excluded).
 *   2. `git status --porcelain` — the still-uncommitted change set (staged, unstaged, and untracked).
 */
export function worktree_changed_files(worktreePath: string, base: string): Result<string[], ChangedFilesError> {
    const fail = (stderr: string): Result<string[], ChangedFilesError> =>
        err(
            createAppError('ChangedFilesFailed', `cannot diff worktree against "${base}": ${stderr}`, {
                worktreePath,
                base,
                stderr,
            })
        );

    const committed = spawnSync('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', `${base}...HEAD`], {
        cwd: worktreePath,
        encoding: 'utf8',
    });
    /* v8 ignore next 3 -- spawn-launch failure (git binary missing); not reachable where git is installed */
    if (committed.error) {
        return fail(committed.error.message);
    }
    if (committed.status !== 0) {
        return fail((committed.stderr || '').trim() || `git diff against ${base} failed`);
    }

    const status = spawnSync('git', ['-c', 'core.quotePath=false', 'status', '--porcelain'], {
        cwd: worktreePath,
        encoding: 'utf8',
    });
    /* v8 ignore next 3 -- spawn-launch failure (git binary missing); not reachable where git is installed */
    if (status.error) {
        return fail(status.error.message);
    }
    /* v8 ignore next 3 -- `git status` only fails outside a repo, which the caller resolves first */
    if (status.status !== 0) {
        return fail((status.stderr || '').trim() || 'git status failed');
    }

    const all = new Set<string>();
    for (const path of (committed.stdout || '').trim().split('\n')) {
        if (path.length > 0) {
            all.add(c_unquote(path));
        }
    }
    for (const path of porcelain_paths(status.stdout || '')) {
        all.add(path);
    }
    return ok([...all].sort());
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
