import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/promote.ts';

const VERDICT_WORDS = /\b(Pass|Fail|Unverified|Blocked)\b/;

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-promote-cmd-'));
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

describe('promote command (direct surface, AC-002/AC-005)', () => {
    it('scaffolds one candidate finding with `from:` pre-filled, exit 0', async () => {
        const { code, out } = await capture(() => run(['TASK-checkout'], ws));
        expect(code).toBe(0);
        expect(out).toContain('candidate finding');
        const content = readFileSync(join(ws, 'findings', 'checkout.md'), 'utf8');
        expect(content).toContain('from: TASK-checkout');
        expect(content).toContain('status: candidate');
        // The scaffold asserts no learning — the body is still a placeholder.
        expect(content).toContain('{{the durable fact, decision, or pattern — one claim}}');
    });

    it('emits no verdict / board-flip / merge decision on stdout (AC-005)', async () => {
        const { out } = await capture(() => run(['TASK-x'], ws));
        expect(out).not.toMatch(VERDICT_WORDS);
        expect(out).not.toContain('status:'); // no board flip on the surface
        expect(out).not.toMatch(/\bmerge\b/i);
        // No board file is created.
        expect(existsSync(join(ws, 'status.md'))).toBe(false);
    });

    it('--json emits a machine path/slug, never a verdict', async () => {
        const { code, out } = await capture(() => run(['TASK-auth', '--json'], ws));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed).toMatchObject({ level: 'clean', slug: 'auth', from: 'TASK-auth' });
        expect(parsed).not.toHaveProperty('verdict');
        expect(out).not.toMatch(VERDICT_WORDS);
    });

    it('no task → usage error, exit 2', async () => {
        const { code, err } = await capture(() => run([], ws));
        expect(code).toBe(2);
        expect(err).toContain('usage: suspec promote');
    });

    it('refuses to clobber an existing finding; --force overwrites exactly that one file', async () => {
        expect((await capture(() => run(['TASK-dup'], ws))).code).toBe(0);
        const second = await capture(() => run(['TASK-dup'], ws));
        expect(second.code).toBe(2);
        expect(second.err).toContain('refusing to overwrite');
        expect((await capture(() => run(['TASK-dup', '--force'], ws))).code).toBe(0);
        expect(readdirSync(join(ws, 'findings'))).toEqual(['dup.md']);
    });

    it('a path-escaping source id → usage error, exit 2', async () => {
        const { code, err } = await capture(() => run(['../escape'], ws));
        expect(code).toBe(2);
        expect(err).toContain('cannot derive a finding slug');
    });
});
