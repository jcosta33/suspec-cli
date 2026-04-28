import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { scoreContent, run } from '../useCases/knowledge.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        find_markdown_files: vi.fn(() => ['/tmp/repo/.agents/tasks/task.md']),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
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
        readFileSync: vi.fn(() => 'This is a task about audio buffers and underrun fixes.'),
    };
});

import { parse_args, find_markdown_files } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('knowledge module', () => {
    describe('scoreContent', () => {
        it('scores matching keywords', () => {
            expect(scoreContent('hello world', ['hello'])).toBe(1);
            expect(scoreContent('hello world', ['hello', 'world'])).toBe(2);
        });

        it('is case insensitive', () => {
            expect(scoreContent('HELLO', ['hello'])).toBe(1);
        });

        it('returns 0 for no matches', () => {
            expect(scoreContent('hello', ['xyz'])).toBe(0);
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

        it('returns 0 when no matches found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['xyz query'], flags: new Map() });
            vi.mocked(find_markdown_files).mockReturnValue([]);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 0 with matches', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['audio buffer'], flags: new Map() });
            vi.mocked(find_markdown_files).mockReturnValue(['/tmp/repo/.agents/tasks/task.md']);
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('This is about audio buffers and fixes.');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('skips nonexistent search dirs', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['test'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
