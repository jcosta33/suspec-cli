import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { skeletonize, run } from '../useCases/compress.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
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
        readFileSync: vi.fn(() => 'import { a } from "./a";\n/** doc */\nexport const x = 1;\nfunction foo() {\n  return 1;\n}'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync } from 'fs';

describe('compress module', () => {
    describe('skeletonize', () => {
        it('keeps imports and exports', () => {
            const result = skeletonize('import { a } from "./a";\nexport const x = 1;');
            expect(result).toContain('import');
            expect(result).toContain('export');
        });

        it('keeps JSDoc blocks', () => {
            const result = skeletonize('/** Hello */\nconst x = 1;');
            expect(result).toContain('/** Hello */');
        });

        it('keeps type declarations', () => {
            const result = skeletonize('interface Foo {}\ntype Bar = string;\nclass Baz {}\nfunction fn() {}');
            expect(result).toContain('interface');
            expect(result).toContain('type');
            expect(result).toContain('class');
            expect(result).toContain('function');
        });

        it('keeps closing braces', () => {
            const result = skeletonize('function foo() {\n  return 1;\n}');
            expect(result).toContain('}');
        });

        it('skips inner implementation lines', () => {
            const result = skeletonize('const x = 1;\n  const y = 2;');
            expect(result).not.toContain('  const y');
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

        it('returns 0 on success', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
