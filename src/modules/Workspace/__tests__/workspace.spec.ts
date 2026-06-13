import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { resolve_repo_root, current_branch, worktree_list, is_worktree_dirty } from '../useCases/index.ts';
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
