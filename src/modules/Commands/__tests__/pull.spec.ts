import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/pull.ts';

// The PASS/FAIL/UNVERIFIED/BLOCKED verdict words and a board-flip shape — the command must emit NONE
// of them on any surface (AC-005: a verdict-free prepare op).
const VERDICT_WORDS = /\b(Pass|Fail|Unverified|Blocked)\b/;

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-pull-cmd-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
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

describe('pull command (direct surface, AC-001/AC-005)', () => {
    it('writes one intake snapshot for a non-gh ref (paste placeholder), exit 0', async () => {
        const { code, out } = await capture(() => run(['JIRA-123'], ws));
        expect(code).toBe(0);
        expect(out).toContain('intake');
        const content = readFileSync(join(ws, 'intake', 'jira-123.md'), 'utf8');
        expect(content).toContain('type: intake');
        expect(content).toContain('Paste the upstream ticket/PR/page content verbatim here');
        // No spec is ever written.
        expect(existsSync(join(ws, 'specs'))).toBe(false);
    });

    it('emits no verdict / board-flip / merge decision on stdout (AC-005)', async () => {
        const { out } = await capture(() => run(['JIRA-123'], ws));
        expect(out).not.toMatch(VERDICT_WORDS);
        expect(out).not.toContain('status:');
        expect(out).not.toMatch(/\bmerge\b/i);
    });

    it('--json emits a machine path/slug, never a verdict', async () => {
        const { code, out } = await capture(() => run(['JIRA-7', '--json'], ws));
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
        const { code, out } = await capture(() => run(['999999'], ws));
        expect(code).toBe(0);
        expect(out).toContain('paste placeholder');
        expect(readFileSync(join(ws, 'intake', 'issue-999999.md'), 'utf8')).toContain(
            'Paste the upstream ticket/PR/page content verbatim here'
        );
    });

    it('no ref → usage error, exit 2, no verdict', async () => {
        const { code, err } = await capture(() => run([], ws));
        expect(code).toBe(2);
        expect(err).toContain('usage: suspec pull');
        expect(err).not.toMatch(VERDICT_WORDS);
    });

    it('refuses to clobber an existing snapshot; --force overwrites exactly that one file', async () => {
        expect((await capture(() => run(['JIRA-9'], ws))).code).toBe(0);
        const second = await capture(() => run(['JIRA-9'], ws));
        expect(second.code).toBe(2);
        expect(second.err).toContain('refusing to overwrite');
        expect((await capture(() => run(['JIRA-9', '--force'], ws))).code).toBe(0);
        expect(readdirSync(join(ws, 'intake'))).toEqual(['jira-9.md']);
    });
});
