import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/format.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('format', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when file is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('formats file successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'file.ts'];
        expect(run()).toBe(0);
    });

    it('returns 1 when formatting fails', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'file.ts'];
        expect(run()).toBe(1);
    });
});
