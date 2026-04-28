import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/ast-rename.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        bold: vi.fn((t: string) => t),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('../../../utils/ast.ts', () => ({
    rename_symbol: vi.fn(() => ({ success: true })),
}));

import { parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { rename_symbol } from '../../../utils/ast.ts';

describe('ast-rename', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when args are missing', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: [], flags: new Map() });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 0 on success', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts', 'OldName', 'NewName'], flags: new Map() });
        vi.mocked(rename_symbol).mockReturnValue({ success: true });
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 on failure', () => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(parse_args).mockReturnValue({ positional: ['src/foo.ts', 'OldName', 'NewName'], flags: new Map() });
        vi.mocked(rename_symbol).mockReturnValue({ success: false, error: 'not found' });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });
});
