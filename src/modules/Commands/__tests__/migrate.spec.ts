import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/migrate.ts';
import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    resolve_within: vi.fn((root: string, path: string) => ({ ok: true, value: `${root}/${path}` })),
}));

describe('migrate', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        writeFileSync('/tmp/repo/file.ts', 'const x = 1;', 'utf8');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when file is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('creates migration tasks successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'file.ts'];
        expect(run()).toBe(0);
    });
});
