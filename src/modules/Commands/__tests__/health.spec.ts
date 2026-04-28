import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/health.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('health', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('runs health checks successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'v1.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 even when pnpm is missing', () => {
        let callCount = 0;
        vi.mocked(spawnSync).mockImplementation(() => {
            callCount++;
            if (callCount <= 2) {
                return { status: 0, stdout: 'v1.0.0\n', stderr: '' } as ReturnType<typeof spawnSync>;
            }
            return { status: 1, stdout: '', stderr: 'not found' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
