import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { escape_regex, run } from '../useCases/find.ts';
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
}));

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

describe('find module', () => {
    describe('escape_regex', () => {
        it('escapes special regex characters', () => {
            expect(escape_regex('a.b')).toBe('a\\.b');
            expect(escape_regex('a*b')).toBe('a\\*b');
            expect(escape_regex('a+b')).toBe('a\\+b');
            expect(escape_regex('a?b')).toBe('a\\?b');
            expect(escape_regex('a^b')).toBe('a\\^b');
            expect(escape_regex('a$b')).toBe('a\\$b');
            expect(escape_regex('a(b')).toBe('a\\(b');
            expect(escape_regex('a)b')).toBe('a\\)b');
            expect(escape_regex('a[b')).toBe('a\\[b');
            expect(escape_regex('a]b')).toBe('a\\]b');
            expect(escape_regex('a{b')).toBe('a\\{b');
            expect(escape_regex('a}b')).toBe('a\\}b');
            expect(escape_regex('a|b')).toBe('a\\|b');
            expect(escape_regex('a\\b')).toBe('a\\\\b');
        });

        it('leaves normal characters unchanged', () => {
            expect(escape_regex('hello-world_123')).toBe('hello-world_123');
        });

        it('handles empty string', () => {
            expect(escape_regex('')).toBe('');
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

        it('returns 1 for unknown query type', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['unknown', 'Foo'], flags: new Map() });
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 and prints matches for class search', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['class', 'Foo'], flags: new Map() });
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/foo.ts:1:class Foo {}\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 when no matches found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['function', 'bar'], flags: new Map() });
            vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('covers interface search', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['interface', 'IFoo'], flags: new Map() });
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/foo.ts:1:interface IFoo {}\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('covers implements search', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['implements', 'IFoo'], flags: new Map() });
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/foo.ts:1:class Foo implements IFoo {}\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('covers extends search', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['extends', 'Base'], flags: new Map() });
            vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'src/foo.ts:1:class Foo extends Base {}\n', stderr: '' } as ReturnType<typeof spawnSync>);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
