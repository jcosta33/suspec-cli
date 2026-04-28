import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/pr.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        red: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
        bold: vi.fn((t: string) => t),
        dim: vi.fn((t: string) => t),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => [{ path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' }]),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => '## Objective\nDo the thing\n'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('pr module', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        expect(run()).toBe(1);
    });

    it('returns 1 when args are missing', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: [], flags: new Map() });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when no worktree found', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['bar'], flags: new Map() });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 0 without push flag', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map() });
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 with push flag', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map([['push', true]]) });
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when push fails', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map([['push', true]]) });
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 0 when gh not found', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map([['push', true]]) });
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when gh pr create fails', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map([['push', true]]) });
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });
});
