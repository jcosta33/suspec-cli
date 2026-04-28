import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/review.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('review', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when branch is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('spawns reviewer agent successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'abc123', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'feature-branch'];
        expect(run()).toBe(0);
    });

    it('returns 1 when branch does not exist', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'missing-branch'];
        expect(run()).toBe(1);
    });

    it('returns 1 when reviewer spawn fails', () => {
        let callCount = 0;
        vi.mocked(spawnSync).mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { status: 0, stdout: 'abc123', stderr: '' } as ReturnType<typeof spawnSync>;
            return { status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>;
        });
        process.argv = ['node', 'script', 'feature-branch'];
        expect(run()).toBe(1);
    });
});
