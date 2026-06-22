import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import {
    resolve_repo_root,
    current_branch,
    commits_ahead_of_remote,
    worktree_list,
    worktree_changed_files,
    is_worktree_dirty,
} from '../useCases/index.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

let repo: string;
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-ws-git-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    git(['commit', '--allow-empty', '-m', 'init']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('Workspace git', () => {
    it('resolve_repo_root returns the root inside a repo and Errs outside one', () => {
        expect(assertOk(resolve_repo_root(repo))).toBe(repo);
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect(assertErr(resolve_repo_root(notRepo))._tag).toBe('NoGitRepo');
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });

    it('current_branch returns the branch and null when detached', () => {
        expect(current_branch(repo)).not.toBeNull();
        git(['checkout', '--detach', 'HEAD']);
        expect(current_branch(repo)).toBeNull();
    });

    it('commits_ahead_of_remote returns null when there is no remote to compare against (#46)', () => {
        // A fresh repo has no upstream and no origin remote-tracking ref — nothing to advise against.
        const base = current_branch(repo) ?? 'main';
        expect(commits_ahead_of_remote(base, repo)).toBeNull();
    });

    it('commits_ahead_of_remote counts commits ahead of the branch upstream, READ-ONLY (#46)', () => {
        const base = current_branch(repo) ?? 'main';
        // Stand up a bare "remote", push the base, and set it as the branch upstream. The local then
        // gets two commits ahead WITHOUT pushing — no fetch happens, so the probe sees the stale remote.
        const remote = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-remote-')));
        try {
            execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
            git(['remote', 'add', 'origin', remote]);
            git(['push', '-u', 'origin', base]);
            expect(commits_ahead_of_remote(base, repo)).toBe(0); // even with the remote, nothing unpushed yet
            git(['commit', '--allow-empty', '-m', 'local 1']);
            git(['commit', '--allow-empty', '-m', 'local 2']);
            expect(commits_ahead_of_remote(base, repo)).toBe(2); // two unpushed local commits
        } finally {
            rmSync(remote, { recursive: true, force: true });
        }
    });

    it('commits_ahead_of_remote falls back to refs/remotes/origin/<branch> when there is no upstream (#46)', () => {
        const base = current_branch(repo) ?? 'main';
        // Create an origin remote-tracking ref WITHOUT setting branch.<base>.merge upstream config: push
        // with --no-set-upstream so `<base>@{upstream}` is unresolvable and the origin fallback is exercised.
        const remote = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-remote-nofu-')));
        try {
            execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
            git(['remote', 'add', 'origin', remote]);
            git(['push', 'origin', base]); // no -u, so no @{upstream}
            git(['fetch', 'origin']); // populate refs/remotes/origin/<base>
            git(['commit', '--allow-empty', '-m', 'local ahead']);
            expect(commits_ahead_of_remote(base, repo)).toBe(1);
        } finally {
            rmSync(remote, { recursive: true, force: true });
        }
    });

    it('worktree_list lists the main worktree', () => {
        const list = worktree_list(repo);
        expect(list.length).toBeGreaterThanOrEqual(1);
        expect(list[0].path).toContain(repo);
    });

    it('is_worktree_dirty reflects uncommitted changes', () => {
        expect(is_worktree_dirty(repo)).toBe(false);
        writeFileSync(join(repo, 'scratch.txt'), 'x');
        expect(is_worktree_dirty(repo)).toBe(true);
        expect(is_worktree_dirty(join(repo, 'does-not-exist'))).toBe(false);
    });

    it('worktree_changed_files reports committed + uncommitted net change against the base (AC-018)', () => {
        // base = the branch this worktree was cut from; make a feature worktree with one committed
        // change and one uncommitted (tracked + untracked) change on top of it.
        const base = current_branch(repo) ?? 'main';
        const wtPath = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-wt-')));
        rmSync(wtPath, { recursive: true, force: true }); // git worktree add wants a non-existent path
        git(['worktree', 'add', '-b', 'swarm/feat/ac-018', wtPath, base]);
        try {
            const wtGit = (args: string[]) => execFileSync('git', args, { cwd: wtPath, encoding: 'utf8' });
            writeFileSync(join(wtPath, 'committed.ts'), 'a');
            wtGit(['add', 'committed.ts']);
            wtGit(['commit', '-m', 'committed change']);
            writeFileSync(join(wtPath, 'staged.ts'), 'b'); // uncommitted, untracked

            const changed = assertOk(worktree_changed_files(wtPath, base));
            expect(changed).toEqual(['committed.ts', 'staged.ts']);
        } finally {
            git(['worktree', 'remove', '--force', wtPath]);
        }
    });

    it('reports the destination of a rename whose OLD name contains " -> " (#25 C4)', () => {
        const base = current_branch(repo) ?? 'main';
        const wtPath = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-wt-rn-')));
        rmSync(wtPath, { recursive: true, force: true });
        git(['worktree', 'add', '-b', 'swarm/feat/ac-rn', wtPath, base]);
        try {
            const wtGit = (args: string[]) => execFileSync('git', args, { cwd: wtPath, encoding: 'utf8' });
            writeFileSync(join(wtPath, 'a -> b.ts'), 'x');
            wtGit(['add', '.']);
            wtGit(['commit', '-m', 'add a file whose name contains an arrow']);
            wtGit(['mv', 'a -> b.ts', 'plain.ts']); // a staged rename; the OLD name itself contains ` -> `
            const changed = assertOk(worktree_changed_files(wtPath, base));
            // the rename destination is reported cleanly, not a mangled split of the arrow-bearing old name
            expect(changed).toContain('plain.ts');
            expect(changed.some((p) => p.includes('" -> '))).toBe(false);
        } finally {
            git(['worktree', 'remove', '--force', wtPath]);
        }
    });

    it('worktree_changed_files Errs on a base ref git cannot resolve (AC-018)', () => {
        expect(assertErr(worktree_changed_files(repo, 'no-such-branch'))._tag).toBe('ChangedFilesFailed');
    });

    it('degrades gracefully outside a git repo', () => {
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect(current_branch(notRepo)).toBeNull();
            expect(worktree_list(notRepo)).toEqual([]);
            expect(is_worktree_dirty(notRepo)).toBe(false);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });
});
