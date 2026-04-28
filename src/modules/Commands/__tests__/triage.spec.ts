import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { generateBugSpec, run } from '../useCases/triage.ts';

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
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => 'bug report content'),
        writeFileSync: vi.fn(() => {}),
        mkdirSync: vi.fn(() => {}),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('triage module', () => {
    describe('generateBugSpec', () => {
        it('generates a bug spec template', () => {
            const result = generateBugSpec('Something is broken', 'my-bug');
            expect(result).toContain('Bug: my-bug');
            expect(result).toContain('Something is broken');
            expect(result).toContain('Reproduction Steps');
        });
    });

    describe('run', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('bug report content');
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
            vi.mocked(parse_args).mockReturnValue({ positional: ['report.txt'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(false);
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });

        it('returns 0 on success', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['report.txt'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('uses slug flag when provided', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['report.txt'], flags: new Map([['slug', 'custom-slug']]) });
            vi.mocked(existsSync).mockReturnValue(true);
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });
    });
});
