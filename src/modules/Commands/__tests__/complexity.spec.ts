import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { calculateComplexity, run } from '../useCases/complexity.ts';

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
        readFileSync: vi.fn(() => 'if (a) {}\nfor (;;) {}\nwhile (true) {}'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('complexity module', () => {
    describe('calculateComplexity', () => {
        it('calculates base score', () => {
            expect(calculateComplexity('const x = 1;')).toBe(1);
        });

        it('counts if statements', () => {
            expect(calculateComplexity('if (a) {}\nif (b) {}')).toBe(3);
        });

        it('counts else if statements', () => {
            expect(calculateComplexity('if (a) {} else if (b) {}')).toBe(4);
        });

        it('counts for and while', () => {
            expect(calculateComplexity('for (;;) {}\nwhile (true) {}')).toBe(3);
        });

        it('counts catch', () => {
            expect(calculateComplexity('try {} catch (e) {}')).toBe(2);
        });

        it('counts logical operators and ternary', () => {
            expect(calculateComplexity('a && b || c ? d : e')).toBe(4);
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

        it('returns 1 when file not found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/missing.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 with low complexity', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('const x = 1;');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 with moderate complexity', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('if (a) {}\nif (b) {}\nif (c) {}\nif (d) {}\nif (e) {}\nif (f) {}\nif (g) {}\nif (h) {}\nif (i) {}\nif (j) {}');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 with high complexity', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('if (a) {}\nif (b) {}\nif (c) {}\nif (d) {}\nif (e) {}\nif (f) {}\nif (g) {}\nif (h) {}\nif (i) {}\nif (j) {}\nif (k) {}\nif (l) {}\nif (m) {}\nif (n) {}\nif (o) {}\nif (p) {}\nif (q) {}\nif (r) {}\nif (s) {}\nif (t) {}\nif (u) {}\nif (v) {}\nif (w) {}\nif (x) {}\nif (y) {}');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
