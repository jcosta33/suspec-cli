import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { run } from '../useCases/pull.ts';

// The PASS/FAIL/UNVERIFIED/BLOCKED verdict words — the command must emit NONE of them on any
// surface (a verdict-free capture op).
const VERDICT_WORDS = /\b(Pass|Fail|Unverified|Blocked)\b/;

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-pull-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
});

async function capture(fn: () => number | Promise<number>): Promise<{ out: string; err: string; code: number }> {
    const out: string[] = [];
    const errs: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        errs.push(String(chunk));
        return true;
    });
    try {
        const code = await fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

describe('pull command — intake-only capture into the STORE (ADR-0137)', () => {
    it('writes one store intake snapshot for a non-gh ref (paste placeholder), exit 0', async () => {
        const { code, out } = await capture(() => run(['JIRA-123'], repo));
        expect(code).toBe(0);
        expect(out).toContain('intake');
        const content = readFileSync(join(store, 'intake-jira-123.md'), 'utf8');
        expect(content).toContain('type: intake');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
        // No spec is ever written — capture only.
        expect(readdirSync(store).filter((name) => name.startsWith('spec-'))).toEqual([]);
        // …and nothing lands in the repo itself.
        expect(existsSync(join(repo, 'intake'))).toBe(false);
    });

    it('emits no verdict / board-flip / merge decision on stdout', async () => {
        const { out } = await capture(() => run(['JIRA-123'], repo));
        expect(out).not.toMatch(VERDICT_WORDS);
        expect(out).not.toContain('status:');
        expect(out).not.toMatch(/\bmerge\b/i);
    });

    it('--json emits a machine path/slug, never a verdict', async () => {
        const { code, out } = await capture(() => run(['JIRA-7', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed).toMatchObject({ level: 'clean', slug: 'jira-7', fetched: false });
        expect(parsed).not.toHaveProperty('verdict');
        expect(parsed).not.toHaveProperty('result');
        expect(out).not.toMatch(VERDICT_WORDS);
    });

    it('a gh-issue ref with no resolvable repo falls back to the paste placeholder (still exit 0)', async () => {
        // The temp dir is not a GitHub repo, so the real `gh issue view` fails — the command must fall
        // back to the placeholder, never crash. (Exercises the real fetcher's failure path.)
        const { code, out } = await capture(() => run(['999999'], repo));
        expect(code).toBe(0);
        expect(out).toContain('paste placeholder');
        expect(readFileSync(join(store, 'intake-issue-999999.md'), 'utf8')).toContain(
            'Paste the upstream ticket/PR/page content verbatim here'
        );
    });

    it('no ref → usage error naming the fix #N division of labor, exit 2', async () => {
        const { code, err } = await capture(() => run([], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage: suspec pull');
        expect(err).toContain('suspec fix #N');
        expect(err).not.toMatch(VERDICT_WORDS);
    });

    it('refuses to clobber an existing snapshot; --force overwrites exactly that one artifact', async () => {
        expect((await capture(() => run(['JIRA-9'], repo))).code).toBe(0);
        const second = await capture(() => run(['JIRA-9'], repo));
        expect(second.code).toBe(2);
        expect(second.err).toContain('already exists');
        expect((await capture(() => run(['JIRA-9', '--force'], repo))).code).toBe(0);
        expect(readdirSync(store).filter((name) => name.startsWith('intake-'))).toEqual(['intake-jira-9.md']);
    });
});
