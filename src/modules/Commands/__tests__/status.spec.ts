import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/status.ts';
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
        cyan: vi.fn((t: string) => t),
        bold: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
        dim: vi.fn((t: string) => t),
        logger: { info: vi.fn(), error: vi.fn(), raw: vi.fn(), warn: vi.fn() },
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => [{ path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' }]),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({ foo: { status: 'running', agent: 'claude', pid: 1234 } })),
    is_process_running: vi.fn(() => true),
    query_sessions: vi.fn(() => []),
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
import { read_state, query_sessions } from '../../AgentState/useCases/index.ts';

describe('status module', () => {
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

    it('returns 0 with state and worktree', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map() });
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 with dirty worktree', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map() });
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'M file.ts\n' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 with no state', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map() });
        vi.mocked(read_state).mockReturnValue({});
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 with sessions', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['foo'], flags: new Map() });
        vi.mocked(query_sessions).mockReturnValue([
            { slug: 'foo', agent: 'claude', started_at: '2024-01-01T00:00:00Z', finished_at: '2024-01-01T00:01:00Z', exit_code: 0 },
        ]);
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 when no worktree found', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['bar'], flags: new Map() });
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
