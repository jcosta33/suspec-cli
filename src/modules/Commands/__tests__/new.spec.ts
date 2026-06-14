import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/new.ts';

const SPEC_X = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — one
The tool must do one.
Verify with: a test.

### AC-002 — two
The tool must do two.
Verify with: a test.
`;

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-new-cmd-'));
    mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'x', 'spec.md'), SPEC_X);
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

async function capture(fn: () => Promise<number>): Promise<{ out: string; err: string; code: number }> {
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

describe('new command (direct surface, AC-013)', () => {
    it('cuts a task packet with the named scope', async () => {
        const { code } = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001,AC-002'], ws));
        expect(code).toBe(0);
        const packet = readFileSync(join(ws, 'tasks', 'TASK-x.md'), 'utf8');
        expect(packet).toContain('scope: [AC-001, AC-002]');
        expect(packet).toContain('- AC-001');
    });

    it('cuts an empty-scope packet without inventing ids', async () => {
        const { code } = await capture(() => run(['task', '--from', 'SPEC-x'], ws));
        expect(code).toBe(0);
        expect(readFileSync(join(ws, 'tasks', 'TASK-x.md'), 'utf8')).toContain('scope: []');
    });

    it('task with no --from → usage error', async () => {
        const { code, err } = await capture(() => run(['task'], ws));
        expect(code).toBe(2);
        expect(err).toContain('usage');
    });

    it('task from a missing spec → exit 2', async () => {
        expect((await capture(() => run(['task', '--from', 'SPEC-missing'], ws))).code).toBe(2);
    });

    it('task with a scope id not in the spec → exit 2', async () => {
        expect((await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-099'], ws))).code).toBe(2);
    });

    it('scaffolds a spec; refuses to clobber on a repeat', async () => {
        const first = await capture(() => run(['spec', 'checkout', '--title', 'Checkout'], ws));
        expect(first.code).toBe(0);
        expect(existsSync(join(ws, 'specs', 'checkout', 'spec.md'))).toBe(true);
        expect((await capture(() => run(['spec', 'checkout'], ws))).code).toBe(2);
    });

    it('spec with no slug → usage error', async () => {
        expect((await capture(() => run(['spec'], ws))).code).toBe(2);
    });

    it('an unknown type → exit 2', async () => {
        const { code, err } = await capture(() => run(['frobnicate'], ws));
        expect(code).toBe(2);
        expect(err).toContain('unknown new type');
    });

    it('no type (non-TTY) → prints usage, never the literal "undefined"', async () => {
        const { code, err } = await capture(() => run([], ws));
        expect(code).toBe(2);
        expect(err).toContain('usage: swarm new');
        expect(err).not.toContain('undefined');
    });

    it('--json emits machine output', async () => {
        const { code, out } = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001', '--json'], ws));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', taskId: 'TASK-x' });
    });
});
