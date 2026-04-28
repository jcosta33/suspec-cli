import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/deps.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

import { existsSync, mkdirSync, writeFileSync } from 'fs';

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('deps', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{}', stderr: '' } as ReturnType<typeof spawnSync>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('checks outdated deps successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"package": {"current": "1.0.0", "latest": "2.0.0"}}', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 when all deps are up to date', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{}', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when package.json is missing', () => {
        vi.mocked(existsSync).mockReturnValue(false);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when npm output is invalid', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'not json', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('skips packages with null info', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '{"package": null}', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
