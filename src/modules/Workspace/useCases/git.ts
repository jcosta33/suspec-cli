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
 * How many commits the local `baseBranch` is AHEAD of its remote-tracking ref — or null when there is
 * no remote to compare against (so nothing to advise). READ-ONLY: never fetches, so it reflects the
 * last known remote state, not a live one. Resolves the remote ref in two steps: the branch's
 * configured `@{upstream}`, else `refs/remotes/origin/<baseBranch>`. A non-zero count means a PR cut
 * from a worktree based here would carry unpushed base commits.
 */
export function commits_ahead_of_remote(baseBranch: string, repoRoot: string): number | null {
    const upstream = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${baseBranch}@{upstream}`], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    let remoteRef: string | null = null;
    if (upstream.status === 0) {
        remoteRef = `${baseBranch}@{upstream}`;
    } else {
        const originRef = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${baseBranch}`], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
        if (originRef.status === 0) {
            remoteRef = `refs/remotes/origin/${baseBranch}`;
        }
    }
    if (remoteRef === null) {
        return null;
    }
    const count = spawnSync('git', ['rev-list', '--count', `${remoteRef}..${baseBranch}`], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    /* v8 ignore next 5 -- defensive: once remoteRef resolved, `rev-list --count` against it cannot fail or emit a non-number */
    if (count.status !== 0) {
        return null;
    }
    const ahead = parseInt((count.stdout || '').trim(), 10);
    return Number.isNaN(ahead) ? null : ahead;
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
        // The flat-vs-task branch-scheme collision (suspec-works #91): a flat `suspec/<slug>` ref
        // blocks creating `suspec/<slug>/<task>` (a ref cannot be both a file and a directory).
        // Name the collision and the two ways out instead of surfacing the raw git fatal alone.
        if (/cannot lock ref/.test(stderr) && branch.includes('/')) {
            const parent = branch.slice(0, branch.lastIndexOf('/'));
            if (branch_exists(parent, repoRoot)) {
                return err(
                    createAppError(
                        'WorktreeCreateFailed',
                        `branch "${branch}" collides with the existing flat branch "${parent}" — a ref cannot be both a file and a directory. Either remove/rename the flat branch (git branch -m ${parent} ${parent}-old) or use a different slug.`,
                        { worktreePath, branch, baseBranch, stderr }
                    )
                );
            }
        }
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
// two sources never reconcile and a spaced/non-ASCII path is dropped or double-counted (private workspace #22). A
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

// Parse `git status --porcelain -z` path fields. With `-z` each entry is NUL-terminated and paths are
// NEVER C-quoted; a rename/copy entry (`R`/`C` in either status column) is followed by a SECOND NUL
// field carrying the OLD path. We keep the new path and skip the old — so a filename that literally
// contains ` -> ` can no longer be mis-split the way the newline `R old -> new` form was (#25 C4).
/**
 * True when the worktree's HEAD is fully merged into `base` — HEAD is an ancestor of base AND is
 * not the base tip itself (a fresh worktree with no commits sits AT the tip; that is "no work
 * yet", not "merged"). Any git failure reads as false: the guard must never block on ambiguity.
 */
export function branch_merged_into(worktreePath: string, base: string): boolean {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', base], {
        cwd: worktreePath,
        encoding: 'utf8',
    });
    if (ancestor.error || ancestor.status !== 0) {
        return false;
    }
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: worktreePath, encoding: 'utf8' });
    const tip = spawnSync('git', ['rev-parse', base], { cwd: worktreePath, encoding: 'utf8' });
    if (head.error || tip.error || head.status !== 0 || tip.status !== 0) {
        return false;
    }
    return head.stdout.trim() !== tip.stdout.trim();
}

function porcelain_paths(raw: string): string[] {
    const paths: string[] = [];
    const fields = raw.split('\0');
    for (let i = 0; i < fields.length; i += 1) {
        const entry = fields[i];
        if (entry.length < 4) {
            continue; // an empty trailing field
        }
        const xy = entry.slice(0, 2);
        paths.push(entry.slice(3)); // `XY ` (two status columns + a space) then the unquoted path
        if (xy.includes('R') || xy.includes('C')) {
            i += 1; // a rename/copy carries its OLD path in the next NUL field — consume + drop it
        }
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

    const status = spawnSync('git', ['-c', 'core.quotePath=false', 'status', '--porcelain', '-z'], {
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
 * Per-file change size (insertions + deletions) of the worktree's committed change against its base
 * branch — the raw signal C018 (oversized-packet) keys on. Returns `{ path, loc }` for each changed
 * file; the contract (checksContract.packet_size_facts) owns the generated-file exclusion + the band,
 * so this stays dumb I/O. `loc` is 0 for a binary file (numstat reports `-`). Scoped to the committed
 * diff (`<base>...HEAD`) — the worker's recorded work, which is what review reconciles; an
 * unresolvable base returns an Err so the command exits 2, never a stack trace.
 */
export function worktree_changed_stats(
    worktreePath: string,
    base: string
): Result<{ path: string; loc: number }[], ChangedFilesError> {
    // `--no-renames` so a renamed file's path field is always a real path (the rename form
    // `old => new` would otherwise land a non-path in the `path` column, disagreeing with
    // `worktree_changed_files`'s `--name-only` destination and confusing the generated-file exclusion).
    const numstat = spawnSync(
        'git',
        ['-c', 'core.quotePath=false', 'diff', '--numstat', '--no-renames', `${base}...HEAD`],
        { cwd: worktreePath, encoding: 'utf8' }
    );
    /* v8 ignore next 3 -- spawn-launch failure (git binary missing); not reachable where git is installed */
    if (numstat.error) {
        return err(
            createAppError('ChangedFilesFailed', `cannot diff worktree against "${base}": ${numstat.error.message}`, {
                worktreePath,
                base,
                stderr: numstat.error.message,
            })
        );
    }
    if (numstat.status !== 0) {
        const stderr = (numstat.stderr || '').trim() || `git diff --numstat against ${base} failed`;
        return err(
            createAppError('ChangedFilesFailed', `cannot diff worktree against "${base}": ${stderr}`, {
                worktreePath,
                base,
                stderr,
            })
        );
    }

    const stats: { path: string; loc: number }[] = [];
    for (const line of (numstat.stdout || '').trim().split('\n')) {
        if (line.length === 0) {
            continue;
        }
        // `<insertions>\t<deletions>\t<path>` — a binary file is `-\t-\t<path>` (loc 0).
        const parts = line.split('\t');
        if (parts.length < 3) {
            continue;
        }
        const insertions = parts[0] === '-' ? 0 : Number(parts[0]);
        const deletions = parts[1] === '-' ? 0 : Number(parts[1]);
        const loc = (Number.isFinite(insertions) ? insertions : 0) + (Number.isFinite(deletions) ? deletions : 0);
        stats.push({ path: c_unquote(parts.slice(2).join('\t')), loc });
    }
    return ok(stats);
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

/**
 * The repo-relative paths that changed between a snapshot commit and the working tree (ADR-0108 item 4
 * staleness). Returns `null` — meaning "cannot determine, skip" — when the SHA does not resolve in this
 * repo or git fails, so the advisory degrades to silence rather than a false flag (0-FP by construction).
 * Compares `<sha>` to the working tree (`git diff <sha>`: committed-since + staged + unstaged), so a
 * still-uncommitted edit counts.
 */
export function paths_changed_since(repoRoot: string, sha: string): string[] | null {
    // Resolve the SHA to a commit first; an unknown/invalid ref degrades to null (skip), never a flag.
    const resolved = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${sha}^{commit}`], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    if (resolved.status !== 0) {
        return null;
    }
    const diff = spawnSync('git', ['-c', 'core.quotePath=false', 'diff', '--name-only', sha], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    /* v8 ignore next 3 -- spawn-launch / non-zero only on a broken repo, which the SHA resolve above already gates */
    if (diff.error || diff.status !== 0) {
        return null;
    }
    return (diff.stdout || '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/**
 * Whether a path is tracked by git — present in the index (committed OR staged), via
 * `git ls-files --error-unmatch` — vs gitignored/untracked. `suspec clean --apply` uses this to decide
 * delete (gitignored ephemeral — recoverable from the run) vs archive (committed-transitory — moved
 * under archive/, ADR-0096). Outside a git repo `git ls-files` is non-zero, so the path reads
 * untracked — callers that need the distinction resolve the repo first.
 */
export function path_is_tracked(repoRoot: string, relPath: string): boolean {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relPath], {
        cwd: repoRoot,
        encoding: 'utf8',
    });
    return result.status === 0;
}

/**
 * The current HEAD commit SHA of a repo, or null outside a repo / with no commits. `suspec stamp` uses
 * it to record the code state a spec snapshot / review was taken against (ADR-0107/0108).
 */
export function head_sha(repoRoot: string): string | null {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
}
