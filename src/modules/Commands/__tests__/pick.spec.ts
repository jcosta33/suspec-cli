import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/pick.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => [
        { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
    ]),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn() };
});

import { fzf_select } from '../../Terminal/useCases/index.ts';
import { worktree_list } from '../../Workspace/useCases/index.ts';

describe('pick', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(process, 'kill').mockImplementation(() => true);
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when no sandboxes exist', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when no selection made', () => {
        vi.mocked(fzf_select).mockReturnValue(null);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('picks and runs action successfully', () => {
        vi.mocked(fzf_select).mockReturnValue('foo');
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'open'];
        expect(run()).toBe(0);
    });

    it('returns 1 for unknown action', () => {
        vi.mocked(fzf_select).mockReturnValue('foo');
        process.argv = ['node', 'script', 'unknown'];
        expect(run()).toBe(1);
    });

    it('handles array selection from fzf', () => {
        vi.mocked(fzf_select).mockReturnValue(['foo']);
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'open'];
        expect(run()).toBe(0);
    });

    it('handles signal from spawned process', () => {
        vi.mocked(fzf_select).mockReturnValue('foo');
        vi.mocked(spawnSync).mockReturnValue({ signal: 'SIGTERM', status: null, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'open'];
        expect(run()).toBe(1);
    });
});
