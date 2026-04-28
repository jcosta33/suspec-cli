import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/prune.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(),
    is_branch_merged_into: vi.fn(() => true),
    worktree_remove: vi.fn((path: string) => ({ ok: true, value: { path } })),
    delete_branch: vi.fn((branch: string) => ({ ok: true, value: { branch } })),
    worktree_prune: vi.fn(),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    remove_state: vi.fn(),
}));

import { worktree_list } from '../../Workspace/useCases/index.ts';

describe('prune', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when no merged sandboxes exist', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        expect(run()).toBe(0);
    });

    it('prunes merged sandboxes', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        expect(run()).toBe(0);
    });
});
