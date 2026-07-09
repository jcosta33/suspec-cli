import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { default_branch, branch_merged } from '../useCases/git.ts';

// SPEC-suspec-v2 AC-018: the two git-truth reads `store doctor` keys on — the default branch it
// reconciles against, and branch-name-keyed mergedness (the worktree may already be gone). Real
// git repos; every resolution rung exercised.

let root: string;
let repo: string;

const git = (args: string[], cwd = repo): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

function init_repo(initialBranch: string): void {
    git(['init', '-b', initialBranch]);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-git-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('default_branch — the doctor base resolution ladder', () => {
    it('prefers the remote-recorded HEAD (refs/remotes/origin/HEAD) over everything local', () => {
        init_repo('local-main');
        git(['update-ref', 'refs/remotes/origin/trunk', 'HEAD']);
        git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk']);
        expect(default_branch(repo)).toBe('trunk');
    });

    it('falls back to a local main, then master, then the current branch, then the literal main', () => {
        init_repo('main');
        expect(default_branch(repo)).toBe('main');

        const master = join(root, 'master-repo');
        mkdirSync(master);
        const prev = repo;
        repo = master;
        init_repo('master');
        expect(default_branch(master)).toBe('master');

        const trunk = join(root, 'trunk-repo');
        mkdirSync(trunk);
        repo = trunk;
        init_repo('trunk'); // no main/master anywhere → the current branch
        expect(default_branch(trunk)).toBe('trunk');

        const unborn = join(root, 'unborn-repo');
        mkdirSync(unborn);
        execFileSync('git', ['init', '-b', 'whatever'], { cwd: unborn }); // no commits → no branches at all
        expect(default_branch(unborn)).toBe('main');
        repo = prev;
    });
});

describe('branch_merged — mergedness by branch NAME (the worktree may be gone)', () => {
    it('true for a branch whose tip landed in the base (merge commit)', () => {
        init_repo('main');
        git(['checkout', '-b', 'suspec/feat']);
        writeFileSync(join(repo, 'w.txt'), 'w');
        git(['add', '.']);
        git(['commit', '-m', 'w']);
        git(['checkout', 'main']);
        git(['merge', '--no-ff', 'suspec/feat']);
        expect(branch_merged('suspec/feat', 'main', repo)).toBe(true);
    });

    it('false for an unmerged branch, a branch sitting AT the base tip (no work), and a missing branch', () => {
        init_repo('main');
        git(['checkout', '-b', 'suspec/wip']);
        writeFileSync(join(repo, 'w.txt'), 'w');
        git(['add', '.']);
        git(['commit', '-m', 'w']);
        git(['checkout', 'main']);
        expect(branch_merged('suspec/wip', 'main', repo)).toBe(false); // ahead, unmerged
        git(['branch', 'suspec/fresh']); // at the tip — "no work yet", not "merged"
        expect(branch_merged('suspec/fresh', 'main', repo)).toBe(false);
        expect(branch_merged('suspec/nope', 'main', repo)).toBe(false); // never existed
    });
});
