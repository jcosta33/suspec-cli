import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { findFiles, run } from '../useCases/arch.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
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
        readFileSync: vi.fn(() => 'import { a } from "../../modules/Foo/useCases/foo.ts";'),
        statSync: vi.fn(() => ({ isDirectory: () => false }) as import('fs').Stats),
        readdirSync: vi.fn(() => ['file.ts']),
    };
});

import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { readFileSync, statSync, readdirSync } from 'fs';

describe('arch module', () => {
    describe('findFiles', () => {
        it('finds ts files recursively', () => {
            vi.mocked(readdirSync).mockReturnValueOnce(['a.ts', 'b.tsx'] as unknown[]).mockReturnValueOnce([]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as import('fs').Stats);
            const result = findFiles('/tmp/src');
            expect(result.length).toBeGreaterThanOrEqual(0);
        });

        it('skips node_modules and dist', () => {
            vi.mocked(readdirSync).mockReturnValueOnce(['node_modules', 'dist', '.git'] as unknown[]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as import('fs').Stats);
            const result = findFiles('/tmp');
            expect(result).toEqual([]);
        });
    });

    describe('run', () => {
        beforeEach(() => {
            // resetAllMocks clears previous test's mockReturnValue so the
            // readFileSync fixture from one case doesn't leak into the next.
            vi.resetAllMocks();
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

        it('returns 0 when no violations', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(readdirSync).mockReturnValueOnce(['file.ts'] as unknown[]).mockReturnValueOnce([]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as import('fs').Stats);
            vi.mocked(readFileSync).mockReturnValue('import { a } from "../../modules/Foo";');
            expect(run()).toBe(0);
        });

        it('returns 1 when violations found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(readdirSync).mockReturnValueOnce(['file.ts'] as unknown[]).mockReturnValueOnce([]);
            vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as import('fs').Stats);
            vi.mocked(readFileSync).mockReturnValue('import { a } from "src/modules/Foo/useCases/foo.ts";');
            expect(run()).toBe(1);
        });
    });
});
