import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/status.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-status-cmd-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

async function capture(fn: () => number | Promise<number>): Promise<{ out: string; code: number }> {
    const out: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
        const code = await fn();
        return { out: out.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

function seed(): void {
    mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n');
    mkdirSync(join(ws, 'tasks'), { recursive: true });
    writeFileSync(
        join(ws, 'tasks', 't1.md'),
        '---\ntype: task\nid: TASK-1\nsource: SPEC-feat\nstatus: review-ready\n---\n'
    );
    mkdirSync(join(ws, 'reviews'), { recursive: true });
    writeFileSync(
        join(ws, 'reviews', 'r1.md'),
        '---\ntype: review\nid: REV-1\ntask: TASK-1\nstatus: needs-human\n---\n'
    );
}

describe('status command (direct surface, AC-011)', () => {
    it('renders an empty board for an empty workspace, exit 0', async () => {
        const { code, out } = await capture(() => run([], ws));
        expect(code).toBe(0);
        expect(out).toContain('no specs yet');
    });

    it('renders the derived board over the workspace artifacts', async () => {
        seed();
        const { code, out } = await capture(() => run([], ws));
        expect(code).toBe(0);
        expect(out).toContain('SPEC-feat');
        expect(out).toContain('Needs human: TASK-1');
    });

    it('--json emits a parseable board', async () => {
        seed();
        const { code, out } = await capture(() => run(['--json'], ws));
        expect(code).toBe(0);
        const board = JSON.parse(out);
        expect(board.specs[0].id).toBe('SPEC-feat');
        expect(board.needsHuman).toEqual(['TASK-1']);
    });

    it('--needs-review narrows the human board to specs with an actionable task; --json stays raw (#92)', async () => {
        seed(); // SPEC-feat / TASK-1 (needs-human) — actionable
        // a second spec whose task already passed review — NOT actionable
        mkdirSync(join(ws, 'specs', 'done'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'done', 'spec.md'), '---\ntype: spec\nid: SPEC-done\nstatus: ready\n---\n');
        writeFileSync(
            join(ws, 'tasks', 't2.md'),
            '---\ntype: task\nid: TASK-2\nsource: SPEC-done\nstatus: done\n---\n'
        );
        writeFileSync(
            join(ws, 'reviews', 'r2.md'),
            '---\ntype: review\nid: REV-2\ntask: TASK-2\nstatus: pass\n---\n'
        );

        const filtered = await capture(() => run(['--needs-review'], ws));
        expect(filtered.code).toBe(0);
        expect(filtered.out).toContain('SPEC-feat'); // has the needs-human task → shown
        expect(filtered.out).not.toContain('SPEC-done'); // task passed → not actionable → hidden from the list
        expect(filtered.out).toContain('Needs human: TASK-1'); // the summary line still renders in full

        // --json is the raw escape hatch — unfiltered even with --needs-review
        const raw = await capture(() => run(['--needs-review', '--json'], ws));
        const board = JSON.parse(raw.out);
        expect(board.specs.map((s: { id: string }) => s.id)).toContain('SPEC-done');
    });
});
