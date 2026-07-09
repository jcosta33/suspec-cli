import { describe, it, expect, vi, beforeEach } from 'vitest';

// The gh.spec.ts stubbing pattern: spawnSync is the single impure edge — mock it so every branch
// runs without a real gh/network. SPEC-suspec-v2 AC-014: gh absent / no PR is a NOTE, never a failure.
const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawnSync }));

const { find_open_pr } = await import('../useCases/ghOpenPr.ts');

beforeEach(() => {
    spawnSync.mockReset();
});

describe('find_open_pr — the AC-014 PR probe', () => {
    it('returns the number for an OPEN PR on the branch', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '{"number":7,"state":"OPEN"}', stderr: '' });
        expect(find_open_pr('suspec/feat', '/repo')).toEqual({ pr: 7, note: null });
        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            ['pr', 'view', 'suspec/feat', '--json', 'number,state'],
            expect.objectContaining({ cwd: '/repo', encoding: 'utf8' })
        );
    });

    it('skips with a note when gh is missing, when there is no PR, and when the PR is not open', () => {
        spawnSync.mockReturnValueOnce({ error: new Error('ENOENT'), status: null, stdout: '', stderr: '' });
        expect(find_open_pr('b', '/r').note).toContain('gh is not installed');

        spawnSync.mockReturnValueOnce({ error: undefined, status: 1, stdout: '', stderr: 'no pull requests' });
        expect(find_open_pr('b', '/r')).toEqual({ pr: null, note: 'no open PR for b — skipping the PR comment' });

        spawnSync.mockReturnValueOnce({ error: undefined, status: 0, stdout: '{"number":7,"state":"MERGED"}', stderr: '' });
        expect(find_open_pr('b', '/r').pr).toBeNull();
    });

    it('skips with a note on unreadable or shape-shifted gh JSON', () => {
        spawnSync.mockReturnValueOnce({ error: undefined, status: 0, stdout: 'not json', stderr: '' });
        expect(find_open_pr('b', '/r').note).toContain('unreadable JSON');

        spawnSync.mockReturnValueOnce({ error: undefined, status: 0, stdout: '"a string"', stderr: '' });
        expect(find_open_pr('b', '/r').note).toContain('unexpected shape');
    });
});
