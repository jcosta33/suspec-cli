import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractExports, run } from '../useCases/dead-code.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
        bold: vi.fn((t: string) => t),
        dim: vi.fn((t: string) => t),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    resolve_within: vi.fn((root: string, path: string) => ({ ok: true, value: `${root}/${path}` })),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => 'export const foo = 1;\nexport function bar() {}'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('dead-code module', () => {
    describe('extractExports', () => {
        it('extracts exported symbols', () => {
            const result = extractExports('export const foo = 1;\nexport function bar() {}\nexport type Baz = string;');
            expect(result).toContain('foo');
            expect(result).toContain('bar');
            expect(result).toContain('Baz');
        });

        it('returns empty array when no exports', () => {
            expect(extractExports('const x = 1;')).toEqual([]);
        });
    });

    describe('run', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export const foo = 1;');
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns 1 when not in a git repo', () => {
            vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
            expect(run()).toBe(1);
        });

        it('returns 1 when args are missing', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: [], flags: new Map() });
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 1 when file not found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/missing.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 when no exports found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('const x = 1;');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 when all exports are used elsewhere', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export const foo = 1;');
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/other.ts\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 and reports dead exports', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export const foo = 1;');
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/foo.ts\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('marks symbol as dead when git grep fails', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('export const foo = 1;');
            vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
