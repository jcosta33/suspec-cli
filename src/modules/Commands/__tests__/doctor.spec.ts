import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run, check_command } from '../useCases/doctor.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    worktree_list: vi.fn(() => []),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({})),
}));

describe('doctor', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mkdirSync('/tmp/repo/.agents/logs', { recursive: true });
        writeFileSync('/tmp/repo/swarm.config.json', '{}', 'utf8');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('check_command', () => {
        it('returns ok when command succeeds', () => {
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v1.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>);
            const result = check_command('node', ['-v']);
            expect(result.ok).toBe(true);
            expect(result.version).toBe('v1.0.0');
        });

        it('returns not ok when command fails', () => {
            vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>);
            const result = check_command('unknown', []);
            expect(result.ok).toBe(false);
        });
    });

    it('runs all checks successfully', async () => {
        let callCount = 0;
        vi.mocked(spawnSync).mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { status: 0, stdout: 'v22.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 2) return { status: 0, stdout: 'git version 2.40.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 3) return { status: 0, stdout: '8.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 4) return { status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 5) return { status: 0, stdout: 'true\n', stderr: '' } as ReturnType<typeof spawnSync>;
            return { status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script'];
        expect(await run()).toBe(0);
    });

    it('returns 1 when node version is too old', async () => {
        let callCount = 0;
        vi.mocked(spawnSync).mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { status: 0, stdout: 'v20.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 2) return { status: 0, stdout: 'git version 2.40.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 3) return { status: 0, stdout: '8.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 4) return { status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
            if (callCount === 5) return { status: 0, stdout: 'true\n', stderr: '' } as ReturnType<typeof spawnSync>;
            return { status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script'];
        expect(await run()).toBe(1);
    });

    it('returns 1 when not in a git repo', async () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(await run()).toBe(1);
    });
});
