import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { auditSecurity, run } from '../useCases/audit-sec.ts';

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
        readFileSync: vi.fn(() => 'const x = 1;'),
    };
});

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('audit-sec module', () => {
    describe('auditSecurity', () => {
        it('finds eval usage', () => {
            const issues = auditSecurity('eval(something)');
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].description).toContain('eval');
        });

        it('finds dangerouslySetInnerHTML', () => {
            const issues = auditSecurity('dangerouslySetInnerHTML={{ __html: html }}');
            expect(issues.some((i) => i.description.includes('dangerouslySetInnerHTML'))).toBe(true);
        });

        it('finds localStorage token', () => {
            const issues = auditSecurity("localStorage.setItem('token', 'abc')");
            expect(issues.some((i) => i.description.includes('localStorage'))).toBe(true);
        });

        it('finds hardcoded API_KEY', () => {
            const issues = auditSecurity('const API_KEY = "secret"');
            expect(issues.some((i) => i.description.includes('API_KEY'))).toBe(true);
        });

        it('finds hardcoded SECRET', () => {
            const issues = auditSecurity('const SECRET = "secret"');
            expect(issues.some((i) => i.description.includes('SECRET'))).toBe(true);
        });

        it('returns empty when clean', () => {
            expect(auditSecurity('const x = 1;')).toEqual([]);
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

        it('returns 0 when no issues found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('const x = 1;');
            process.argv = ['node', 'script'];
            expect(run()).toBe(0);
        });

        it('returns 1 when issues found', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts'], flags: new Map() });
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('eval(something)');
            process.argv = ['node', 'script'];
            expect(run()).toBe(1);
        });
    });
});
