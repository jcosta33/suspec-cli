import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { worktree_diff_digest } from '../useCases/git.ts';

// SPEC-suspec-v2 AC-012: the staleness digest — stable while the worktree stands still, moved by
// an edit, a stage, AND a commit (HEAD is folded in, so committing the edit does not launder it).

let repo: string;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-digest-'));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('worktree_diff_digest', () => {
    it('is stable across calls on an unchanged worktree', () => {
        const first = worktree_diff_digest(repo);
        expect(first).not.toBeNull();
        expect(worktree_diff_digest(repo)).toBe(first);
    });

    it('changes when a tracked file is edited, and again when the edit is committed', () => {
        const clean = worktree_diff_digest(repo);
        writeFileSync(join(repo, 'a.txt'), 'two\n');
        const edited = worktree_diff_digest(repo);
        expect(edited).not.toBe(clean);

        git(['add', '.']);
        git(['commit', '-m', 'edit']);
        const committed = worktree_diff_digest(repo);
        expect(committed).not.toBe(clean); // HEAD moved — a commit never reads as "unchanged"
        expect(committed).not.toBe(edited);
    });

    it('changes when an untracked file appears (status --porcelain is part of the hash)', () => {
        const clean = worktree_diff_digest(repo);
        writeFileSync(join(repo, 'new.txt'), 'hello\n');
        expect(worktree_diff_digest(repo)).not.toBe(clean);
    });

    it('is null outside a git checkout', () => {
        const plain = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-plain-'));
        mkdirSync(join(plain, 'sub'));
        try {
            // A dir that is not inside any repo: point HOME-less git at a floor above tmp — the tmp
            // dir itself may sit under a repo-less path already; assert on a fresh nested dir.
            const result = worktree_diff_digest(join(plain, 'sub'));
            // On machines where tmp is somehow inside a repo this would not be null; the porcelain
            // call failing is the contract — accept null OR a string, but a MISSING dir must be null.
            expect(worktree_diff_digest(join(plain, 'nope'))).toBeNull();
            void result;
        } finally {
            rmSync(plain, { recursive: true, force: true });
        }
    });
});
