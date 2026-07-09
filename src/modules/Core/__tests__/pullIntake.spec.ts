import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { ok, err } from '../../../infra/errors/result.ts';
import { createAppError } from '../../../infra/errors/createAppError.ts';
import { pull_intake, type GhFetcher } from '../useCases/pullIntake.ts';

let ws: string;

// A fetcher stub that returns a fixed gh issue — the engine takes the fetcher injected, so no `gh`
// process is spawned in unit tests.
const fetch_ok =
    (title: string, body: string): GhFetcher =>
    () =>
        ok({ title, body, labels: [] });
// A fetcher that fails (no gh / no such issue) — the engine must fall back to the paste placeholder.
const fetch_fail: GhFetcher = (ref) =>
    err(createAppError('GhFetchFailed', `could not fetch ${ref}`, { ref, stderr: '' }));
// A fetcher that must never be called — for non-gh refs.
const fetch_never: GhFetcher = () => {
    throw new Error('fetch must not be attempted for a non-gh ref');
};

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-pull-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('pull_intake — verbatim intake snapshot, never a spec (AC-001)', () => {
    it('writes one intake/<slug>.md from a gh issue with the source/url/captured frontmatter and the verbatim body', () => {
        const report = assertOk(
            pull_intake({
                workspaceDir: ws,
                ref: 'jcosta33/suspec-cli#42',
                fetchGhIssue: fetch_ok('Wire the gate', 'The gate must stay green.\n\n- run vitest'),
            })
        );
        expect(report.slug).toBe('jcosta33-suspec-cli-42');
        expect(report.fetched).toBe(true);
        expect(report.path).toBe(join(ws, 'intake', 'jcosta33-suspec-cli-42.md'));

        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('type: intake');
        expect(content).toContain('source: gh-issue');
        expect(content).toContain('url: jcosta33/suspec-cli#42');
        expect(content).toMatch(/captured: \d{4}-\d{2}-\d{2}/);
        expect(content).toContain('# Intake: Wire the gate');
        // The upstream body is carried VERBATIM (un-normalized), markdown bullets and all.
        expect(content).toContain('The gate must stay green.\n\n- run vitest');
    });

    it('writes NO spec — only the one intake file appears under the workspace', () => {
        assertOk(pull_intake({ workspaceDir: ws, ref: '7', fetchGhIssue: fetch_ok('A title', 'A body') }));
        expect(existsSync(join(ws, 'specs'))).toBe(false);
        expect(readdirSync(join(ws, 'intake'))).toEqual(['issue-7.md']);
    });

    it('falls back to a clearly-marked paste placeholder when a gh fetch fails', () => {
        const report = assertOk(pull_intake({ workspaceDir: ws, ref: '#99', fetchGhIssue: fetch_fail }));
        expect(report.fetched).toBe(false);
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
        expect(content).toContain('could\nnot fetch this ref automatically');
        // Frontmatter still carries the template placeholders + the ref as the url.
        expect(content).toContain('url: #99');
    });

    it('writes a paste placeholder for a non-gh ref and never attempts a fetch', () => {
        const report = assertOk(pull_intake({ workspaceDir: ws, ref: 'JIRA-123', fetchGhIssue: fetch_never }));
        expect(report.fetched).toBe(false);
        expect(report.slug).toBe('jira-123');
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
    });

    it('translates an owner/repo#N ref into the issue URL gh accepts, but records the typed ref + slug', () => {
        let seen = '';
        const capture: GhFetcher = (ref) => {
            seen = ref;
            return ok({ title: 'T', body: 'B', labels: [] });
        };
        const report = assertOk(
            pull_intake({ workspaceDir: ws, ref: 'jcosta33/suspec-cli#42', fetchGhIssue: capture })
        );
        // gh rejects the `owner/repo#N` shorthand, so the fetcher is handed the equivalent URL …
        expect(seen).toBe('https://github.com/jcosta33/suspec-cli/issues/42');
        // … while the recorded url + the slug keep the ref the user typed.
        expect(report.slug).toBe('jcosta33-suspec-cli-42');
        expect(readFileSync(report.path, 'utf8')).toContain('url: jcosta33/suspec-cli#42');
    });

    it('passes a bare number / URL ref through to the fetcher unchanged', () => {
        let seen = '';
        const capture: GhFetcher = (ref) => {
            seen = ref;
            return ok({ title: 'T', body: 'B', labels: [] });
        };
        assertOk(pull_intake({ workspaceDir: ws, ref: '7', fetchGhIssue: capture }));
        expect(seen).toBe('7');
        assertOk(pull_intake({ workspaceDir: ws, ref: 'https://github.com/o/r/issues/9', fetchGhIssue: capture }));
        expect(seen).toBe('https://github.com/o/r/issues/9');
    });

    it('slugs a github issue URL by its path tail', () => {
        const report = assertOk(
            pull_intake({
                workspaceDir: ws,
                ref: 'https://github.com/o/r/issues/12',
                fetchGhIssue: fetch_ok('T', 'B'),
            })
        );
        expect(report.slug).toBe('o-r-issues-12');
        expect(report.fetched).toBe(true);
    });

    it('an empty-bodied fetched issue still marks fetched, but writes the paste placeholder for the body, titled by the ref', () => {
        const report = assertOk(pull_intake({ workspaceDir: ws, ref: '8', fetchGhIssue: fetch_ok('', '') }));
        expect(report.fetched).toBe(true);
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('source: gh-issue');
        // Empty title → titled by the ref; empty body → the paste placeholder.
        expect(content).toContain('# Intake: 8');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
    });
});

describe('pull_intake — write-safety (AC-004)', () => {
    it('refuses to overwrite an existing snapshot; only --force replaces it', () => {
        assertOk(pull_intake({ workspaceDir: ws, ref: '5', fetchGhIssue: fetch_ok('one', 'first') }));
        const before = readFileSync(join(ws, 'intake', 'issue-5.md'), 'utf8');

        // Second pull over the same target errors, and the file is byte-unchanged.
        expect(
            assertErr(pull_intake({ workspaceDir: ws, ref: '5', fetchGhIssue: fetch_ok('two', 'second') }))._tag
        ).toBe('FileExists');
        expect(readFileSync(join(ws, 'intake', 'issue-5.md'), 'utf8')).toBe(before);

        // --force replaces exactly that one file.
        assertOk(pull_intake({ workspaceDir: ws, ref: '5', force: true, fetchGhIssue: fetch_ok('two', 'second') }));
        expect(readFileSync(join(ws, 'intake', 'issue-5.md'), 'utf8')).toContain('second');
        expect(readdirSync(join(ws, 'intake'))).toEqual(['issue-5.md']);
    });

    it('leaves an existing status.md byte-unchanged (the board is never touched, AC-003)', () => {
        const board = '# Board\n\n| spec | task |\n| --- | --- |\n| SPEC-x | TASK-x |\n';
        writeFileSync(join(ws, 'status.md'), board);
        assertOk(pull_intake({ workspaceDir: ws, ref: '1', fetchGhIssue: fetch_ok('t', 'b') }));
        expect(readFileSync(join(ws, 'status.md'), 'utf8')).toBe(board);
    });
});

describe('pull_intake — usage errors', () => {
    it('rejects an empty ref', () => {
        expect(assertErr(pull_intake({ workspaceDir: ws, ref: '   ', fetchGhIssue: fetch_never }))._tag).toBe('Usage');
    });

    it('rejects a ref with no slug-able characters', () => {
        expect(assertErr(pull_intake({ workspaceDir: ws, ref: '###', fetchGhIssue: fetch_never }))._tag).toBe('Usage');
    });

    it('does not create the intake dir when the ref is rejected', () => {
        mkdirSync(join(ws, 'specs'), { recursive: true });
        assertErr(pull_intake({ workspaceDir: ws, ref: '', fetchGhIssue: fetch_never }));
        expect(existsSync(join(ws, 'intake'))).toBe(false);
    });
});
