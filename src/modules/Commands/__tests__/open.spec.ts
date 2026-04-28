import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/open.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    find_worktree_for_branch: vi.fn(),
    worktree_list: vi.fn(() => []),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({})),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn(), red: vi.fn((t: string) => t), yellow: vi.fn((t: string) => t) };
});

vi.mock('../useCases/launch-agent.ts', () => ({
    run_agent_launch: vi.fn(() => 0),
}));

import { find_worktree_for_branch, worktree_list } from '../../Workspace/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { fzf_select } from '../../Terminal/useCases/index.ts';

describe("open", () => {
    beforeEach(() => {
        vi.resetAllMocks();
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
        vi.mocked(find_worktree_for_branch).mockReturnValue(null);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('opens sandbox successfully', () => {
        vi.mocked(find_worktree_for_branch).mockReturnValue('/tmp/repo/.agents/agent-foo');
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });

    it('returns 1 when no active sandboxes', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('opens sandbox via fzf selection', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockReturnValue('foo');
        vi.mocked(find_worktree_for_branch).mockReturnValue('/tmp/repo/.agents/agent-foo');
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when fzf selection is empty', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockReturnValue(null);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when fzf throws', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(fzf_select).mockImplementation(() => { throw new Error('fzf not found'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });
});
