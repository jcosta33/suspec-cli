import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generateMockFactory, run } from '../useCases/mock.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
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
        readFileSync: vi.fn(() => 'interface Foo { name: string; count: number; active: boolean; items: string[]; }'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync } from 'fs';

describe('mock module', () => {
    describe('generateMockFactory', () => {
        it('generates mock for interface', () => {
            const content = 'interface User { name: string; age: number; }';
            const result = generateMockFactory(content, 'User', 'user.ts');
            expect(result).toContain('createMockUser');
            expect(result).toContain('name');
            expect(result).toContain('age');
        });

        it('uses defaults when interface not found', () => {
            const result = generateMockFactory('', 'Missing', 'file.ts');
            expect(result).toContain('createMockMissing');
            expect(result).toContain('TODO');
        });

        it('handles function properties', () => {
            const content = 'interface Api { fetch: () => Promise<void>; }';
            const result = generateMockFactory(content, 'Api', 'api.ts');
            expect(result).toContain('vi.fn()');
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
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/missing.ts', 'Foo'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 on success', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts', 'Foo'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
