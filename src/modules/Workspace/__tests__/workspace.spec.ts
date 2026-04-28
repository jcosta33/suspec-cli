import {
    get_repo_name,
    worktree_list,
    branch_exists,
    find_worktree_for_branch,
    is_worktree_dirty,
    get_status_summary,
    is_branch_merged_into,
    delete_branch,
    list_branches_by_prefix,
    worktree_sync,
    worktree_create,
    worktree_remove,
    worktree_prune,
} from '../../Workspace/useCases/index.ts';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock child_process spawnSync for worktree_list tests
vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawnSync: vi.fn(),
    };
});

import { spawnSync } from 'child_process';

describe('workspace module', () => {
    beforeEach(() => {
        (spawnSync as ReturnType<typeof vi.fn>).mockClear();
    });

    describe('get_repo_name', () => {
        it('returns the basename of a repo root path', () => {
            expect(get_repo_name('/Users/dev/projects/swarm-cli')).toBe('swarm-cli');
            expect(get_repo_name('/home/user/my-repo')).toBe('my-repo');
        });
    });

    describe('worktree_list', () => {
        it('parses git worktree list --porcelain output', () => {
            const mockOutput = `worktree /Users/dev/projects/swarm-cli
HEAD abc1234
branch refs/heads/main

worktree /Users/dev/projects/swarm-cli--feature-x
HEAD def5678
branch refs/heads/agent/feature-x

worktree /Users/dev/bare-repo
HEAD 0000000
bare
`;
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: mockOutput,
                stderr: '',
            });

            const list = worktree_list('/Users/dev/projects/swarm-cli');

            expect(list).toHaveLength(3);
            expect(list[0]).toEqual({ path: '/Users/dev/projects/swarm-cli', head: 'abc1234', branch: 'main', bare: false });
            expect(list[1]).toEqual({ path: '/Users/dev/projects/swarm-cli--feature-x', head: 'def5678', branch: 'agent/feature-x', bare: false });
            expect(list[2]).toEqual({ path: '/Users/dev/bare-repo', head: '0000000', branch: null, bare: true });
        });

        it('returns empty array when git command fails', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 128,
                stdout: '',
                stderr: 'fatal: not a git repository',
            });

            const list = worktree_list('/not-a-repo');
            expect(list).toEqual([]);
        });
    });

    describe('branch_exists', () => {
        it('returns true when branch exists', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            expect(branch_exists('main', '/repo')).toBe(true);
        });

        it('returns false when branch does not exist', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 1 });
            expect(branch_exists('nonexistent', '/repo')).toBe(false);
        });
    });

    describe('find_worktree_for_branch', () => {
        it('returns worktree path when branch is found', () => {
            const mockOutput = `worktree /repo
HEAD abc
branch refs/heads/main

worktree /repo--feature
HEAD def
branch refs/heads/agent/feature
`;
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: mockOutput,
                stderr: '',
            });
            expect(find_worktree_for_branch('agent/feature', '/repo')).toBe('/repo--feature');
        });

        it('returns null when branch is not found', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n',
                stderr: '',
            });
            expect(find_worktree_for_branch('agent/missing', '/repo')).toBeNull();
        });
    });

    describe('is_worktree_dirty', () => {
        it('returns true when there are uncommitted changes', () => {
            const tempDir = mkdtempSync(join(tmpdir(), 'swarm-dirty-test-'));
            mkdirSync(join(tempDir, '.git'), { recursive: true });
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: ' M src/index.ts\n?? new-file.ts\n',
            });
            expect(is_worktree_dirty(tempDir)).toBe(true);
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns false when worktree is clean', () => {
            const tempDir = mkdtempSync(join(tmpdir(), 'swarm-clean-test-'));
            mkdirSync(join(tempDir, '.git'), { recursive: true });
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: '',
            });
            expect(is_worktree_dirty(tempDir)).toBe(false);
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns false when path does not exist', () => {
            expect(is_worktree_dirty('/nonexistent')).toBe(false);
        });
    });

    describe('get_status_summary', () => {
        it('returns clean for empty stdout', () => {
            const tempDir = mkdtempSync(join(tmpdir(), 'swarm-status-test-'));
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: '',
            });
            expect(get_status_summary(tempDir)).toBe('clean');
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns dirty with change count', () => {
            const tempDir = mkdtempSync(join(tmpdir(), 'swarm-status-test-'));
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: ' M a.ts\n?? b.ts\n',
            });
            expect(get_status_summary(tempDir)).toBe('dirty (2 changes)');
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns dirty with singular form', () => {
            const tempDir = mkdtempSync(join(tmpdir(), 'swarm-status-test-'));
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: ' M a.ts\n',
            });
            expect(get_status_summary(tempDir)).toBe('dirty (1 change)');
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns missing for non-existent path', () => {
            expect(get_status_summary('/nonexistent')).toBe('missing');
        });
    });

    describe('is_branch_merged_into', () => {
        it('returns true when branch has unique commits and is merged', () => {
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 0, stdout: '2' }) // unique count > 0
                .mockReturnValueOnce({ status: 0, stdout: '  main\n  feature\n' }); // merged list
            expect(is_branch_merged_into('feature', 'main', '/repo')).toBe(true);
        });

        it('returns false when branch is not merged', () => {
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 0, stdout: '3' }) // unique count > 0
                .mockReturnValueOnce({ status: 0, stdout: '  main\n' }); // feature not in list
            expect(is_branch_merged_into('feature', 'main', '/repo')).toBe(false);
        });
    });

    describe('delete_branch (basic spawn shape)', () => {
        it('deletes branch with -d by default', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            delete_branch('old-feature', '/repo');
            const lastCall = (spawnSync as ReturnType<typeof vi.fn>).mock.calls.at(-1);
            expect(lastCall).toEqual(['git', ['branch', '-d', 'old-feature'], { cwd: '/repo', encoding: 'utf8' }]);
        });

        it('deletes branch with -D when force is true', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            delete_branch('old-feature', '/repo', true);
            const lastCall = (spawnSync as ReturnType<typeof vi.fn>).mock.calls.at(-1);
            expect(lastCall).toEqual(['git', ['branch', '-D', 'old-feature'], { cwd: '/repo', encoding: 'utf8' }]);
        });
    });

    describe('list_branches_by_prefix', () => {
        it('returns branches matching prefix', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: '  agent/foo\n* agent/bar\n+ agent/baz\n',
            });
            const branches = list_branches_by_prefix('agent/', '/repo');
            expect(branches).toEqual(['agent/foo', 'agent/bar', 'agent/baz']);
        });

        it('returns empty array when no branches match', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 0,
                stdout: '',
            });
            expect(list_branches_by_prefix('nonexistent/', '/repo')).toEqual([]);
        });
    });

    describe('worktree_sync', () => {
        it('returns true when rebase succeeds', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            expect(worktree_sync('/repo--feature', 'main')).toBe(true);
        });

        it('returns false when rebase fails', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 1 });
            expect(worktree_sync('/repo--feature', 'main')).toBe(false);
        });
    });

    describe('worktree_create', () => {
        it('creates worktree for existing branch and returns Ok', () => {
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 0 }) // branch_exists = true
                .mockReturnValueOnce({ status: 0 }); // worktree add
            const result = worktree_create('/repo--feature', 'agent/feature', 'main', '/repo');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({ path: '/repo--feature', branch: 'agent/feature' });
            }
            const calls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
            const lastCall = calls[calls.length - 1];
            expect(lastCall).toEqual(['git', ['worktree', 'add', '/repo--feature', 'agent/feature'], { cwd: '/repo', encoding: 'utf8' }]);
        });

        it('creates new branch when branch does not exist', () => {
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 1 }) // branch_exists = false
                .mockReturnValueOnce({ status: 0 }); // worktree add -b
            const result = worktree_create('/repo--feature', 'agent/feature', 'main', '/repo');
            expect(result.ok).toBe(true);
            const calls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
            const lastCall = calls[calls.length - 1];
            expect(lastCall).toEqual(['git', ['worktree', 'add', '-b', 'agent/feature', '/repo--feature', 'main'], { cwd: '/repo', encoding: 'utf8' }]);
        });

        it('returns a tagged WorktreeCreateFailed error when git fails', () => {
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 1 }) // branch_exists = false
                .mockReturnValueOnce({ status: 128, stderr: "fatal: '/repo--feature' already exists" });
            const result = worktree_create('/repo--feature', 'agent/feature', 'main', '/repo');
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error._tag).toBe('WorktreeCreateFailed');
                expect(result.error.worktreePath).toBe('/repo--feature');
                expect(result.error.branch).toBe('agent/feature');
                expect(result.error.baseBranch).toBe('main');
                expect(result.error.stderr).toContain('already exists');
            }
        });

        it('captures spawn-level errors as WorktreeCreateFailed', () => {
            const spawnError = Object.assign(new Error('git not found'), { code: 'ENOENT' });
            (spawnSync as ReturnType<typeof vi.fn>)
                .mockReturnValueOnce({ status: 1 }) // branch_exists = false
                .mockReturnValueOnce({ error: spawnError, status: null });
            const result = worktree_create('/repo--feature', 'agent/feature', 'main', '/repo');
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error._tag).toBe('WorktreeCreateFailed');
                expect(result.error.message).toContain('git not found');
            }
        });
    });

    describe('worktree_remove', () => {
        it('removes worktree without force and returns Ok', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            const result = worktree_remove('/repo--feature', false, '/repo');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({ path: '/repo--feature' });
            }
            expect(spawnSync).toHaveBeenLastCalledWith('git', ['worktree', 'remove', '/repo--feature'], { cwd: '/repo', encoding: 'utf8' });
        });

        it('removes worktree with force', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            const result = worktree_remove('/repo--feature', true, '/repo');
            expect(result.ok).toBe(true);
            expect(spawnSync).toHaveBeenLastCalledWith('git', ['worktree', 'remove', '--force', '/repo--feature'], { cwd: '/repo', encoding: 'utf8' });
        });

        it('returns a tagged WorktreeRemoveFailed error when git refuses', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 128,
                stderr: "fatal: '/repo--feature' contains modified or untracked files",
            });
            const result = worktree_remove('/repo--feature', false, '/repo');
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error._tag).toBe('WorktreeRemoveFailed');
                expect(result.error.worktreePath).toBe('/repo--feature');
                expect(result.error.force).toBe(false);
                expect(result.error.stderr).toContain('contains modified');
            }
        });
    });

    describe('delete_branch', () => {
        it('deletes branch and returns Ok', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            const result = delete_branch('agent/feature', '/repo', false);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({ branch: 'agent/feature' });
            }
            expect(spawnSync).toHaveBeenLastCalledWith('git', ['branch', '-d', 'agent/feature'], { cwd: '/repo', encoding: 'utf8' });
        });

        it('uses -D when force is true', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            const result = delete_branch('agent/feature', '/repo', true);
            expect(result.ok).toBe(true);
            expect(spawnSync).toHaveBeenLastCalledWith('git', ['branch', '-D', 'agent/feature'], { cwd: '/repo', encoding: 'utf8' });
        });

        it('returns a tagged DeleteBranchFailed error when git refuses', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
                status: 1,
                stderr: 'error: branch not fully merged',
            });
            const result = delete_branch('agent/feature', '/repo', false);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error._tag).toBe('DeleteBranchFailed');
                expect(result.error.branch).toBe('agent/feature');
                expect(result.error.force).toBe(false);
                expect(result.error.stderr).toContain('not fully merged');
            }
        });
    });

    describe('worktree_prune', () => {
        it('runs git worktree prune', () => {
            (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });
            worktree_prune('/repo');
            expect(spawnSync).toHaveBeenLastCalledWith('git', ['worktree', 'prune'], { cwd: '/repo', encoding: 'utf8' });
        });
    });
});
