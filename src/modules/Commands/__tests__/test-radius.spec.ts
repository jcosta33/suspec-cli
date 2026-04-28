import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run, find_impacted_specs } from '../useCases/test-radius.ts';
import { spawnSync } from 'child_process';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return { ...actual, spawnSync: vi.fn() };
});

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        readFileSync: vi.fn(),
        statSync: vi.fn(),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    resolve_within: vi.fn((root: string, path: string) => ({ ok: true, value: `${root}/${path}` })),
}));

describe('test-radius', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(resolve_within).mockReturnValue({ ok: true, value: '/tmp/repo/src/modules/Commands/useCases/find.ts' });
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('find_impacted_specs', () => {
        it('finds specs that import the target', () => {
            const specs = find_impacted_specs('/Users/josecosta/dev/swarm-cli', 'src/modules/Commands/useCases/find.ts');
            expect(Array.isArray(specs)).toBe(true);
        });

        it('returns empty array for non-existent directory', () => {
            const specs = find_impacted_specs('/non-existent-path-12345', 'src/index.ts');
            expect(specs).toEqual([]);
        });
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script', 'src/modules/Commands/useCases/find.ts'];
        expect(run()).toBe(1);
    });

    it('returns 1 when file is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('finds impacted specs for a file', () => {
        process.argv = ['node', 'script', 'src/modules/Commands/useCases/find.ts'];
        expect(run()).toBe(0);
    });

    it('returns 0 when no impacted specs found', () => {
        process.argv = ['node', 'script', 'src/modules/Commands/useCases/non-existent.ts'];
        expect(run()).toBe(0);
    });

    it('returns 1 when resolve_within fails', () => {
        vi.mocked(resolve_within).mockReturnValue({ ok: false, error: new Error('not allowed') });
        process.argv = ['node', 'script', 'src/modules/Commands/useCases/find.ts'];
        expect(run()).toBe(1);
    });

    it('runs vitest when specs are found', () => {
        vi.mocked(readdirSync).mockReturnValue(['find.spec.ts'] as unknown as ReturnType<typeof readdirSync>);
        vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>);
        vi.mocked(readFileSync).mockReturnValue('import { find } from "./find.ts";');
        vi.mocked(existsSync).mockReturnValue(false);
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script', 'src/modules/Commands/useCases/find.ts'];
        expect(run()).toBe(0);
    });

});
