import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/references.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    resolve_within: vi.fn((root: string, path: string) => ({ ok: true, value: `${root}/${path}` })),
}));

describe('references', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when symbol is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('finds references successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'file.ts:10:foo', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });

    it('handles no references found', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });
});
