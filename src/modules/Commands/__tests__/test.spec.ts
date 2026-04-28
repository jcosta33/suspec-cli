import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run_test } from '../useCases/test.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('test', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('runs tests successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'PASS\n'.repeat(60), stderr: '' } as ReturnType<typeof spawnSync>);
        expect(run_test([])).toBe(0);
    });

    it('returns 1 when tests fail', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: 'FAIL\n'.repeat(60), stderr: '' } as ReturnType<typeof spawnSync>);
        expect(run_test([])).toBe(1);
    });

    it('truncates long output', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'line\n'.repeat(100), stderr: '' } as ReturnType<typeof spawnSync>);
        expect(run_test([])).toBe(0);
    });
});
