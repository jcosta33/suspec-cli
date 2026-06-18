import { describe, it, expect, vi, beforeEach } from 'vitest';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

// `spawnSync` is the single impure edge — mock it so every branch of `fetch_gh_issue` (spawn error,
// non-zero exit, unreadable JSON, non-object JSON, success) is exercised without a real `gh` / network.
const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawnSync }));

// Import AFTER the mock is registered.
const { fetch_gh_issue } = await import('../useCases/gh.ts');

beforeEach(() => {
    spawnSync.mockReset();
});

describe('fetch_gh_issue — the gh CLI read (the pull floor)', () => {
    it('returns the issue title + body on a clean gh exit', () => {
        spawnSync.mockReturnValue({
            error: undefined,
            status: 0,
            stdout: JSON.stringify({ title: 'Wire the gate', body: 'The gate must stay green.' }),
            stderr: '',
        });
        const issue = assertOk(fetch_gh_issue('o/r#42'));
        expect(issue).toEqual({ title: 'Wire the gate', body: 'The gate must stay green.' });
        // It calls `gh issue view <ref> --json title,body` — read-only, never a write.
        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            ['issue', 'view', 'o/r#42', '--json', 'title,body'],
            expect.objectContaining({ encoding: 'utf8' })
        );
    });

    it('coerces missing title/body fields to empty strings', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '{}', stderr: '' });
        expect(assertOk(fetch_gh_issue('5'))).toEqual({ title: '', body: '' });
    });

    it('is an Err when gh is not installed (spawn error)', () => {
        spawnSync.mockReturnValue({ error: new Error('spawn gh ENOENT'), status: null, stdout: '', stderr: '' });
        const error = assertErr(fetch_gh_issue('5'));
        expect(error._tag).toBe('GhFetchFailed');
        expect(error.message).toContain('not in PATH');
    });

    it('is an Err on a non-zero gh exit (no such issue / not authenticated)', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 1, stdout: '', stderr: 'could not resolve to an Issue' });
        const error = assertErr(fetch_gh_issue('999'));
        expect(error._tag).toBe('GhFetchFailed');
        expect(error.message).toContain('could not resolve to an Issue');
    });

    it('is an Err on a non-zero exit with empty stderr (falls back to a status message)', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 2, stdout: '', stderr: '' });
        expect(assertErr(fetch_gh_issue('7')).message).toContain('exited with status 2');
    });

    it('is an Err on unreadable JSON', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: 'not json', stderr: '' });
        expect(assertErr(fetch_gh_issue('5')).message).toContain('unreadable JSON');
    });

    it('is an Err when gh returns a non-object JSON value', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: '"a string"', stderr: '' });
        expect(assertErr(fetch_gh_issue('5')).message).toContain('unexpected shape');
    });
});
