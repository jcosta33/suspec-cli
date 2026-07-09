import { describe, it, expect, vi, beforeEach } from 'vitest';

// spawnSync mocked per the gh.spec.ts pattern. SPEC-suspec-v2 AC-014: the comment is found by
// MARKER and PATCHed by id — created only when absent, never stacked.
const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ spawnSync }));

const { upsert_pr_comment } = await import('../useCases/ghPrComment.ts');

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

beforeEach(() => {
    spawnSync.mockReset();
});

const MARKER = '<!-- suspec:digest:feat -->';

function input(buildBody = (existing: string | null) => `${MARKER}\nnew digest\n<!-- /suspec:digest:feat -->${existing !== null ? '|had-existing' : ''}`) {
    return { cwd: '/repo', pr: 7, marker: MARKER, buildBody };
}

describe('upsert_pr_comment — the AC-014 living comment', () => {
    it('POSTs a fresh comment when no comment carries the marker', () => {
        spawnSync
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '[{"id":1,"body":"unrelated"}]', stderr: '' })
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '{"id":101}', stderr: '' });
        const report = assertOk(upsert_pr_comment(input()));
        expect(report).toEqual({ action: 'created', commentId: 101 });

        const [listCall, postCall] = spawnSync.mock.calls;
        expect(listCall[1]).toEqual(['api', 'repos/{owner}/{repo}/issues/7/comments', '--paginate']);
        expect(postCall[1][1]).toBe('repos/{owner}/{repo}/issues/7/comments');
        expect(postCall[1]).toContain('-f');
        expect(String(postCall[1][3])).toContain('new digest');
        expect(String(postCall[1][3])).not.toContain('had-existing'); // built from a null existing body
    });

    it('PATCHes the SAME comment (by id) when the marker is found — the builder sees the old body', () => {
        spawnSync
            .mockReturnValueOnce({
                error: undefined,
                status: 0,
                stdout: JSON.stringify([
                    { id: 1, body: 'unrelated' },
                    { id: 42, body: `intro\n${MARKER}\nold digest\n<!-- /suspec:digest:feat -->` },
                ]),
                stderr: '',
            })
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '{}', stderr: '' });
        const report = assertOk(upsert_pr_comment(input()));
        expect(report).toEqual({ action: 'edited', commentId: 42 });

        const patchCall = spawnSync.mock.calls[1];
        expect(patchCall[1][1]).toBe('repos/{owner}/{repo}/issues/comments/42');
        expect(patchCall[1]).toContain('PATCH');
        expect(String(patchCall[1][5])).toContain('had-existing'); // the builder received the existing body
    });

    it('tolerates a created-comment response without a parseable id, and junk in the listing', () => {
        spawnSync
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '[1, {"id":"x"}, null]', stderr: '' })
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: 'not json', stderr: '' });
        expect(assertOk(upsert_pr_comment(input()))).toEqual({ action: 'created', commentId: null });

        spawnSync
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: 'not json at all', stderr: '' })
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '{}', stderr: '' });
        expect(assertOk(upsert_pr_comment(input())).action).toBe('created');
    });

    it('treats an empty listing response as no comments (creates)', () => {
        spawnSync
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '', stderr: '' })
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '{"id":102}', stderr: '' });
        expect(assertOk(upsert_pr_comment(input()))).toEqual({ action: 'created', commentId: 102 });
    });

    it('is an Err when the PATCH itself fails', () => {
        spawnSync
            .mockReturnValueOnce({
                error: undefined,
                status: 0,
                stdout: JSON.stringify([{ id: 42, body: `${MARKER} old` }]),
                stderr: '',
            })
            .mockReturnValueOnce({ error: undefined, status: 1, stdout: '', stderr: 'HTTP 502' });
        expect(assertErr(upsert_pr_comment(input())).message).toContain('HTTP 502');
    });

    it('is an Err when gh is missing, and when the list / write call fails', () => {
        spawnSync.mockReturnValueOnce({ error: new Error('ENOENT'), status: null, stdout: '', stderr: '' });
        expect(assertErr(upsert_pr_comment(input()))._tag).toBe('gh_api_failed');

        spawnSync.mockReturnValueOnce({ error: undefined, status: 1, stdout: '', stderr: 'HTTP 404' });
        expect(assertErr(upsert_pr_comment(input())).message).toContain('HTTP 404');

        spawnSync
            .mockReturnValueOnce({ error: undefined, status: 0, stdout: '[]', stderr: '' })
            .mockReturnValueOnce({ error: undefined, status: 1, stdout: '', stderr: '' });
        expect(assertErr(upsert_pr_comment(input())).message).toContain('exited with status 1');
    });
});
