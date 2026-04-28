import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/heal.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('heal', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when typecheck passes', () => {
        vi.mocked(spawnSync).mockImplementation(() => {
            return { status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('spawns fix agent when typecheck fails', () => {
        let callCount = 0;
        vi.mocked(spawnSync).mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return { status: 1, stdout: '', stderr: 'error' } as ReturnType<typeof spawnSync>;
            }
            return { status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when heal agent spawn fails', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });
});
