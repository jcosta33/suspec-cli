import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/list.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(),
    list_branches_by_prefix: vi.fn(),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({})),
    is_process_running: vi.fn(() => false),
}));

import { get_repo_root, worktree_list, list_branches_by_prefix } from '../../Workspace/useCases/index.ts';

describe('list', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when no sandboxes exist', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        vi.mocked(list_branches_by_prefix).mockReturnValue([]);
        expect(run()).toBe(0);
    });

    it('lists active sandboxes', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        vi.mocked(list_branches_by_prefix).mockReturnValue([]);
        expect(run()).toBe(0);
    });

    it('warns about orphaned branches', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        vi.mocked(list_branches_by_prefix).mockReturnValue(['agent/orphan']);
        expect(run()).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        expect(run()).toBe(1);
    });
});
