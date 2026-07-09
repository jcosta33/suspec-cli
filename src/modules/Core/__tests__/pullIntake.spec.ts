import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { ok, err } from '../../../infra/errors/result.ts';
import { createAppError } from '../../../infra/errors/createAppError.ts';
import { pull_intake, type GhFetcher } from '../useCases/pullIntake.ts';

let store: string;
let repo: string;

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

const pull = (over: Partial<Parameters<typeof pull_intake>[0]>) =>
    pull_intake({ storeDir: store, repoRoot: repo, ref: '1', fetchGhIssue: fetch_never, ...over });

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-pullstore-'));
    repo = mkdtempSync(join(tmpdir(), 'suspec-pullrepo-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
});

describe('pull_intake — verbatim STORE intake snapshot, never a spec (ADR-0137)', () => {
    it('writes one intake-<slug>.md into the store from a gh issue, verbatim, grammar-stamped', () => {
        const report = assertOk(
            pull({
                ref: 'jcosta33/suspec-cli#42',
                fetchGhIssue: fetch_ok('Wire the gate', 'The gate must stay green.\n\n- run vitest'),
            })
        );
        expect(report.slug).toBe('jcosta33-suspec-cli-42');
        expect(report.fetched).toBe(true);
        expect(report.path).toBe(join(store, 'intake-jcosta33-suspec-cli-42.md'));

        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('type: intake');
        expect(content).toContain('source: gh-issue');
        // The recorded url makes the snapshot re-pullable after a store wipe.
        expect(content).toContain('url: jcosta33/suspec-cli#42');
        expect(content).toMatch(/captured: \d{4}-\d{2}-\d{2}/);
        expect(content).toContain('# Intake: Wire the gate');
        // The upstream body is carried VERBATIM (un-normalized), markdown bullets and all.
        expect(content).toContain('The gate must stay green.\n\n- run vitest');
        // The atomic store write stamps the grammar version.
        expect(content).toContain('grammar_version:');
    });

    it('writes NO spec — only the one intake artifact lands in the store', () => {
        assertOk(pull({ ref: '7', fetchGhIssue: fetch_ok('A title', 'A body') }));
        expect(readdirSync(store)).toEqual(['intake-issue-7.md']);
    });

    it('falls back to a clearly-marked paste placeholder when a gh fetch fails', () => {
        const report = assertOk(pull({ ref: '#99', fetchGhIssue: fetch_fail }));
        expect(report.fetched).toBe(false);
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
        expect(content).toContain('url: #99');
    });

    it('writes a paste placeholder for a non-gh ref and never attempts a fetch', () => {
        const report = assertOk(pull({ ref: 'JIRA-123' }));
        expect(report.fetched).toBe(false);
        expect(report.slug).toBe('jira-123');
        expect(readFileSync(report.path, 'utf8')).toContain('Paste the upstream ticket/PR/page content verbatim here');
    });

    it('translates an owner/repo#N ref into the issue URL gh accepts, but records the typed ref + slug', () => {
        let seen = '';
        const capture: GhFetcher = (ref) => {
            seen = ref;
            return ok({ title: 'T', body: 'B', labels: [] });
        };
        const report = assertOk(pull({ ref: 'jcosta33/suspec-cli#42', fetchGhIssue: capture }));
        expect(seen).toBe('https://github.com/jcosta33/suspec-cli/issues/42');
        expect(report.slug).toBe('jcosta33-suspec-cli-42');
        expect(readFileSync(report.path, 'utf8')).toContain('url: jcosta33/suspec-cli#42');
    });

    it('passes a bare number / URL ref through to the fetcher unchanged', () => {
        let seen = '';
        const capture: GhFetcher = (ref) => {
            seen = ref;
            return ok({ title: 'T', body: 'B', labels: [] });
        };
        assertOk(pull({ ref: '7', fetchGhIssue: capture }));
        expect(seen).toBe('7');
        assertOk(pull({ ref: 'https://github.com/o/r/issues/9', fetchGhIssue: capture }));
        expect(seen).toBe('https://github.com/o/r/issues/9');
    });

    it('an empty-bodied fetched issue still marks fetched, writes the placeholder body, titled by the ref', () => {
        const report = assertOk(pull({ ref: '8', fetchGhIssue: fetch_ok('', '') }));
        expect(report.fetched).toBe(true);
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('source: gh-issue');
        expect(content).toContain('# Intake: 8');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
    });
});

describe('pull_intake — write-safety', () => {
    it('refuses to overwrite an existing snapshot; only --force replaces it', () => {
        assertOk(pull({ ref: '5', fetchGhIssue: fetch_ok('one', 'first') }));
        const path = join(store, 'intake-issue-5.md');
        const before = readFileSync(path, 'utf8');

        expect(assertErr(pull({ ref: '5', fetchGhIssue: fetch_ok('two', 'second') }))._tag).toBe('intake_exists');
        expect(readFileSync(path, 'utf8')).toBe(before);

        assertOk(pull({ ref: '5', force: true, fetchGhIssue: fetch_ok('two', 'second') }));
        expect(readFileSync(path, 'utf8')).toContain('second');
        expect(readdirSync(store)).toEqual(['intake-issue-5.md']);
    });

    it('leaves every other store artifact byte-unchanged', () => {
        const spec = '---\ntype: spec\nid: SPEC-x\n---\n\n# X\n';
        writeFileSync(join(store, 'spec-x.md'), spec);
        assertOk(pull({ ref: '1', fetchGhIssue: fetch_ok('t', 'b') }));
        expect(readFileSync(join(store, 'spec-x.md'), 'utf8')).toBe(spec);
    });
});

describe('pull_intake — usage errors', () => {
    it('rejects an empty ref', () => {
        expect(assertErr(pull({ ref: '   ' }))._tag).toBe('Usage');
    });

    it('rejects a ref with no slug-able characters', () => {
        expect(assertErr(pull({ ref: '###' }))._tag).toBe('Usage');
    });
});
