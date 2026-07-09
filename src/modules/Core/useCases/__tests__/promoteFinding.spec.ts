import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { promote_finding } from '../promoteFinding.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { ok, err } from '../../../../infra/errors/result.ts';
import { createAppError } from '../../../../infra/errors/createAppError.ts';

// SPEC-suspec-v2 AC-015 (promote arm): gh issue from the finding, the ref stamped back, the
// transient copy archived. The gh edge is injected.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-promote-'));
    writeFileSync(
        join(store, 'finding-001.md'),
        '---\ntype: finding\nrun: feat\nseverity: minor\n---\n\n# Flaky teardown in worktree tests\n\ndetails\n'
    );
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('promote_finding', () => {
    it('creates the issue from the finding title + body, stamps the ref, archives the file', () => {
        const calls: { title: string; body: string }[] = [];
        const report = assertOk(
            promote_finding({
                storeDir: store,
                filename: 'finding-001.md',
                createIssue: (input) => {
                    calls.push(input);
                    return ok({ number: 55, url: 'https://github.com/o/r/issues/55' });
                },
            })
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].title).toBe('Flaky teardown in worktree tests');
        expect(calls[0].body).toContain('details');

        expect(existsSync(join(store, 'finding-001.md'))).toBe(false);
        const archived = readFileSync(report.archivedPath, 'utf8');
        expect(report.archivedPath).toBe(join(store, 'archive', 'finding-001.md'));
        expect(archived).toContain('status: promoted');
        expect(archived).toContain('issue: #55');
        expect(archived).toContain('details'); // body preserved
    });

    it('falls back to the url as the ref when gh reports no parseable number, and to the filename as title', () => {
        writeFileSync(join(store, 'finding-002.md'), '---\ntype: finding\nrun: feat\n---\nno heading\n');
        const report = assertOk(
            promote_finding({
                storeDir: store,
                filename: 'finding-002.md',
                createIssue: (input) => {
                    expect(input.title).toBe('finding-002');
                    return ok({ number: null, url: 'https://github.com/o/r/issues/new' });
                },
            })
        );
        expect(readFileSync(report.archivedPath, 'utf8')).toContain('issue: https://github.com/o/r/issues/new');
    });

    it('leaves the finding untouched when the gh create fails', () => {
        const before = readFileSync(join(store, 'finding-001.md'), 'utf8');
        const error = assertErr(
            promote_finding({
                storeDir: store,
                filename: 'finding-001.md',
                createIssue: () => err(createAppError('gh_issue_create_failed', 'no gh', {})),
            })
        );
        expect(error._tag).toBe('gh_issue_create_failed');
        expect(readFileSync(join(store, 'finding-001.md'), 'utf8')).toBe(before);
        expect(existsSync(join(store, 'archive'))).toBe(false);
    });

    it('is an Err when the stamped rewrite cannot land (a read-only store) — after the issue exists', () => {
        const error = assertErr(
            promote_finding({
                storeDir: store,
                filename: 'finding-001.md',
                createIssue: () => {
                    chmodSync(store, 0o555); // sabotage between the read and the stamp write
                    return ok({ number: 1, url: 'https://github.com/o/r/issues/1' });
                },
            })
        );
        chmodSync(store, 0o755);
        expect(error._tag).toBe('store_write_failed');
    });

    it('is an Err when the archive slot is already taken — the stamped finding stays in the root', () => {
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'finding-001.md'), 'an older namesake');
        const error = assertErr(
            promote_finding({
                storeDir: store,
                filename: 'finding-001.md',
                createIssue: () => ok({ number: 2, url: 'https://github.com/o/r/issues/2' }),
            })
        );
        expect(error._tag).toBe('store_archive_collision');
        expect(existsSync(join(store, 'finding-001.md'))).toBe(true);
    });

    it('is an Err for an unreadable finding — the issue is never created', () => {
        let created = 0;
        const error = assertErr(
            promote_finding({
                storeDir: store,
                filename: 'finding-nope.md',
                createIssue: () => {
                    created += 1;
                    return ok({ number: 1, url: 'x' });
                },
            })
        );
        expect(error._tag).toBe('finding_unreadable');
        expect(created).toBe(0);
    });
});
