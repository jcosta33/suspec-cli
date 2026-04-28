import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/release.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('release', () => {
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

    it('generates release notes with no previous tag', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, stdout: 'abc - fix bug\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 when no new commits', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0, stdout: 'v1.0.0', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when git log fails', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0, stdout: 'v1.0.0', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('bumps major on breaking change', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0, stdout: 'v1.0.0', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, stdout: 'abc - breaking: change api\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('bumps minor on feat', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0, stdout: 'v1.0.0', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, stdout: 'abc - feat: new thing\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('bumps patch by default', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 0, stdout: 'v1.0.0', stderr: '' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, stdout: 'abc - fix bug\n', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
