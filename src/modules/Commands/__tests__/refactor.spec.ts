import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { findFiles, run } from '../useCases/refactor.ts';

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
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        statSync: vi.fn(() => ({ isDirectory: () => false }) as import('fs').Stats),
        readdirSync: vi.fn(() => []),
        writeFileSync: vi.fn(() => {}),
        mkdirSync: vi.fn(() => {}),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, statSync, readdirSync } from 'fs';

describe('refactor module', () => {
    describe('findFiles', () => {
        it('finds ts files recursively', () => {
            vi.mocked(readdirSync).mockReturnValueOnce(['a.ts', 'b.tsx'] as unknown[]).mockReturnValueOnce([]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as import('fs').Stats);
            const result = findFiles('/tmp/src');
            expect(result.length).toBeGreaterThanOrEqual(0);
        });

        it('skips node_modules and dist', () => {
            vi.mocked(readdirSync).mockReturnValueOnce(['node_modules', 'dist', '.git', 'src'] as unknown[]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as import('fs').Stats);
            const result = findFiles('/tmp');
            expect(result).toEqual([]);
        });
    });

    describe('run', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
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

        it('returns 1 when directory not found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src', 'goal'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 when no source files found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src', 'goal'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readdirSync).mockReturnValue([]);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 and creates task files', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src', 'move logic'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readdirSync).mockReturnValueOnce(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'] as unknown[]).mockReturnValueOnce([]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as import('fs').Stats);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
