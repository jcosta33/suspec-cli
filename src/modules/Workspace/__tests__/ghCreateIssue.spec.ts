import { describe, it, expect, vi, beforeEach } from 'vitest';

// spawnSync mocked per the gh.spec.ts pattern. SPEC-suspec-v2 AC-015 (promote arm): the issue is
// created via gh; the number is lifted from the printed URL.
const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawnSync }));

const { create_gh_issue } = await import('../useCases/ghCreateIssue.ts');

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

beforeEach(() => {
    spawnSync.mockReset();
});

describe('create_gh_issue', () => {
    it('creates the issue with title + body and parses the number from the URL', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: 'https://github.com/o/r/issues/55\n', stderr: '' });
        const created = assertOk(create_gh_issue({ title: 'T', body: 'B', cwd: '/repo' }));
        expect(created).toEqual({ number: 55, url: 'https://github.com/o/r/issues/55' });
        expect(spawnSync).toHaveBeenCalledWith(
            'gh',
            ['issue', 'create', '--title', 'T', '--body', 'B'],
            expect.objectContaining({ cwd: '/repo', encoding: 'utf8' })
        );
    });

    it('keeps the url with a null number when the URL shape is unexpected', () => {
        spawnSync.mockReturnValue({ error: undefined, status: 0, stdout: 'created, see the web UI\n', stderr: '' });
        expect(assertOk(create_gh_issue({ title: 'T', body: 'B', cwd: '/r' })).number).toBeNull();
    });

    it('is an Err when gh is missing or the create fails (with a status fallback message)', () => {
        spawnSync.mockReturnValueOnce({ error: new Error('ENOENT'), status: null, stdout: '', stderr: '' });
        expect(assertErr(create_gh_issue({ title: 'T', body: 'B', cwd: '/r' }))._tag).toBe('gh_issue_create_failed');

        spawnSync.mockReturnValueOnce({ error: undefined, status: 1, stdout: '', stderr: 'no repo' });
        expect(assertErr(create_gh_issue({ title: 'T', body: 'B', cwd: '/r' })).message).toContain('no repo');

        spawnSync.mockReturnValueOnce({ error: undefined, status: 4, stdout: '', stderr: '' });
        expect(assertErr(create_gh_issue({ title: 'T', body: 'B', cwd: '/r' })).message).toContain('status 4');
    });
});
