import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/path.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => []),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), fzf_select: vi.fn() };
});

import { worktree_list } from '../../Workspace/useCases/index.ts';

describe('path', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('prints path for matching sandbox', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
        ]);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
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
});
