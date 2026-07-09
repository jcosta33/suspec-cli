import { describe, it, expect, vi, beforeEach } from 'vitest';

// `spawnSync` is the single impure edge — mock it so every branch of `probe_pr_state` (spawn
// error, non-zero exit, unreadable JSON, non-object JSON, a non-string state, success) is
// exercised without a real `gh`.
const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawnSync }));

const { probe_pr_state } = await import('../useCases/ghPrState.ts');

beforeEach(() => {
    spawnSync.mockReset();
});

describe('probe_pr_state — the doctor PR-state edge (AC-018)', () => {
    it('reports the PR state from a clean gh exit, via `gh pr view <branch> --json state`', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '{"state":"MERGED"}', stderr: '' });
        expect(probe_pr_state('suspec/feat', '/repo')).toEqual({ available: true, state: 'MERGED' });
        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            ['pr', 'view', 'suspec/feat', '--json', 'state'],
            expect.objectContaining({ cwd: '/repo', encoding: 'utf8' })
        );
    });

    it('gh missing (spawn error) → available: false, so the doctor skips PR checks with a note', () => {
        spawnSync.mockReturnValue({ error: new Error('spawn gh ENOENT'), status: null, stdout: '', stderr: '' });
        expect(probe_pr_state('b', '/repo')).toEqual({ available: false, state: null });
    });

    it('no PR for the branch (non-zero exit) → available with a null state — a non-event', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 1, stdout: '', stderr: 'no pull requests found' });
        expect(probe_pr_state('b', '/repo')).toEqual({ available: true, state: null });
    });

    it('unreadable JSON, a non-object payload, and a non-string state all read as no state', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: 'not json', stderr: '' });
        expect(probe_pr_state('b', '/repo')).toEqual({ available: true, state: null });
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '"OPEN"', stderr: '' });
        expect(probe_pr_state('b', '/repo')).toEqual({ available: true, state: null });
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '{"state":7}', stderr: '' });
        expect(probe_pr_state('b', '/repo')).toEqual({ available: true, state: null });
    });
});
