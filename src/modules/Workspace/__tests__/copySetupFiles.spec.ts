import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { copy_setup_files } from '../useCases/copySetupFiles.ts';

// SPEC-suspec-v2 AC-005: setup_copy copies ONLY the allowlisted repo-root-relative paths into the
// worktree; absolute paths and paths escaping the repo are refused; a missing source is reported.

let root: string;
let repo: string;
let worktree: string;

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-copy-')));
    repo = join(root, 'repo');
    worktree = join(root, 'repo', '.worktrees', 'feat');
    mkdirSync(join(repo, 'config'), { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(repo, '.env.local'), 'SECRET=1');
    writeFileSync(join(repo, 'config', 'local.json'), '{"k":1}');
    writeFileSync(join(root, 'outside.txt'), 'outside');
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('copy_setup_files (AC-005)', () => {
    it('copies allowlisted files into the worktree at the same relative path (nested dirs created)', () => {
        const results = copy_setup_files(repo, worktree, ['.env.local', 'config/local.json']);
        expect(results).toEqual([
            { path: '.env.local', ok: true, reason: null },
            { path: 'config/local.json', ok: true, reason: null },
        ]);
        expect(readFileSync(join(worktree, '.env.local'), 'utf8')).toBe('SECRET=1');
        expect(readFileSync(join(worktree, 'config', 'local.json'), 'utf8')).toBe('{"k":1}');
    });

    it('refuses an absolute path and a path escaping the repo — nothing is copied for them', () => {
        const results = copy_setup_files(repo, worktree, [join(root, 'outside.txt'), '../outside.txt']);
        expect(results[0].ok).toBe(false);
        expect(results[0].reason).toMatch(/absolute path refused/);
        expect(results[1].ok).toBe(false);
        expect(results[1].reason).toMatch(/escapes the repo root/);
        expect(existsSync(join(worktree, 'outside.txt'))).toBe(false);
    });

    it('reports a declared file that is missing from the repo root', () => {
        const [result] = copy_setup_files(repo, worktree, ['.env.production']);
        expect(result).toEqual({ path: '.env.production', ok: false, reason: 'not found in the repo root' });
    });

    it('reports (never throws) an IO failure — the target parent is an existing FILE', () => {
        writeFileSync(join(worktree, 'config'), 'a file where a dir must go');
        const [result] = copy_setup_files(repo, worktree, ['config/local.json']);
        expect(result.ok).toBe(false);
        expect(result.reason).not.toBeNull();
    });

    it('refuses a symlinked source — the link could point outside the repo; nothing is copied', () => {
        writeFileSync(join(root, 'outside-secret.txt'), 'OUTSIDE', 'utf8');
        symlinkSync(join(root, 'outside-secret.txt'), join(repo, '.env.link'));
        const [result] = copy_setup_files(repo, worktree, ['.env.link']);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/symlink refused/);
        expect(existsSync(join(worktree, '.env.link'))).toBe(false);
    });
});
