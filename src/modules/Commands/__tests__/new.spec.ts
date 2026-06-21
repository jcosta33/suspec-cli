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

    it('--id cuts a distinctly-named second task from one spec (split-work), normalizing to TASK-<slug>', async () => {
        // The default id is TASK-<spec-slug> (TASK-x), which collides on the second cut. --id lets one
        // spec fan out to several tasks; a bare slug is normalized to the canonical TASK- prefix so it
        // keys the same as the default everywhere downstream (status, the worktree branch, resolve_task).
        const first = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-001'], ws));
        expect(first.code).toBe(0);
        const second = await capture(() => run(['task', '--from', 'SPEC-x', '--scope', 'AC-002', '--id', 'x-part-two'], ws));
        expect(second.code).toBe(0);
        expect(existsSync(join(ws, 'tasks', 'TASK-x.md'))).toBe(true);
        const part2 = readFileSync(join(ws, 'tasks', 'TASK-x-part-two.md'), 'utf8');
        expect(part2).toContain('id: TASK-x-part-two');
        expect(part2).toContain('- AC-002');

        // A prefixed / mixed-case --id normalizes at the command surface to the canonical TASK-<lower>.
        const third = await capture(() => run(['task', '--from', 'SPEC-x', '--id', 'TASK-X-Part-Three'], ws));
        expect(third.code).toBe(0);
        expect(readFileSync(join(ws, 'tasks', 'TASK-x-part-three.md'), 'utf8')).toContain('id: TASK-x-part-three');
    });

    it('an empty --id is a usage error, not a TASK-.md packet', async () => {
        const { code, err } = await capture(() => run(['task', '--from', 'SPEC-x', '--id', ''], ws));
        expect(code).toBe(2);
        expect(err).toContain('--id');
        expect(existsSync(join(ws, 'tasks', 'TASK-.md'))).toBe(false);
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

    it('scaffolds a change plan; refuses to clobber on a repeat (R4-ISS-06)', async () => {
        const first = await capture(() => run(['change-plan', 'db-migration', '--title', 'DB migration'], ws));
        expect(first.code).toBe(0);
        const plan = readFileSync(join(ws, 'change-plans', 'db-migration.md'), 'utf8');
        expect(plan).toContain('id: CHANGE-db-migration');
        expect(plan).toContain('## Behavioral preservation guarantees');
        expect(plan).toContain('## Transformation waves');
        expect((await capture(() => run(['change-plan', 'db-migration'], ws))).code).toBe(2);
    });

    it('change-plan with no slug → usage error', async () => {
        const { code, err } = await capture(() => run(['change-plan'], ws));
        expect(code).toBe(2);
        expect(err).toContain('usage');
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
