import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/show.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => []),
    is_worktree_dirty: vi.fn(() => false),
    get_status_summary: vi.fn(() => 'M file.ts'),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({})),
    is_process_running: vi.fn(() => true),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn() };
});

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), box: vi.fn() };
});

import { worktree_list } from '../../Workspace/useCases/index.ts';

describe('show', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
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

    it('shows sandbox details', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });
});
