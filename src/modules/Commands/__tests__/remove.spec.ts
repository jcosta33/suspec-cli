import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/remove.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => []),
    // worktree_remove and delete_branch now return Result<>.
    worktree_remove: vi.fn((path: string) => ({ ok: true, value: { path } })),
    delete_branch: vi.fn((branch: string) => ({ ok: true, value: { branch } })),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    remove_state: vi.fn(),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn(), red: vi.fn((t: string) => t), yellow: vi.fn((t: string) => t), green: vi.fn((t: string) => t), bold: vi.fn((t: string) => t), logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), raw: vi.fn() } };
});

import { get_repo_root, worktree_list, worktree_remove, delete_branch } from '../../Workspace/useCases/index.ts';
import { fzf_select } from '../../Terminal/useCases/index.ts';

describe('remove', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(worktree_list).mockReturnValue([]);
        vi.mocked(worktree_remove).mockReturnValue({ ok: true, value: { path: '/tmp/repo/.agents/agent-foo' } });
        vi.mocked(delete_branch).mockReturnValue({ ok: true, value: { branch: 'agent/foo' } });
        vi.mocked(fzf_select).mockReturnValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when slug is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when sandbox not found', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('returns 1 without --force flag', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('removes sandbox with --force', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        process.argv = ['node', 'script', 'foo', '--force'];
        expect(run()).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('returns 1 when worktree removal fails', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(worktree_remove).mockReturnValue({
            ok: false,
            error: Object.assign(new Error('git error'), {
                _tag: 'WorktreeRemoveFailed' as const,
                worktreePath: '/tmp/repo/.agents/agent-foo',
                force: true,
                stderr: 'git error',
            }),
        });
        process.argv = ['node', 'script', 'foo', '--force'];
        expect(run()).toBe(1);
    });

    it('warns when branch deletion fails', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(delete_branch).mockReturnValue({
            ok: false,
            error: Object.assign(new Error('branch error'), { _tag: 'BranchDeleteFailed' as const }),
        });
        process.argv = ['node', 'script', 'foo', '--force'];
        expect(run()).toBe(0);
    });

    it('returns 1 when no sandboxes available', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('removes sandbox via fzf selection', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockReturnValue('foo');
        process.argv = ['node', 'script', '--force'];
        expect(run()).toBe(0);
    });

    it('returns 1 when fzf selection is empty', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockReturnValue(null);
        process.argv = ['node', 'script', '--force'];
        expect(run()).toBe(1);
    });

    it('returns 1 when fzf throws', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockImplementation(() => { throw new Error('fzf not found'); });
        process.argv = ['node', 'script', '--force'];
        expect(run()).toBe(1);
    });
});
