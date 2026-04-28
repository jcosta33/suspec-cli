import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/repro.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('repro', () => {
    beforeEach(() => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('passes when spec files are modified', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'M src/test.spec.ts', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('fails when source files are modified without specs', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/index.ts\nsrc/utils.ts\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when git diff fails', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 0 when no changes', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
