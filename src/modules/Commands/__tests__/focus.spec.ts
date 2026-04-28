import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/focus.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => []),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn() };
});

import { worktree_list } from '../../Workspace/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('focus', () => {
    beforeEach(() => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when slug is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when worktree not found', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('opens editor successfully', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });

    it('returns 1 when editor fails', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });
});
