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

async function capture(fn: () => Promise<number>): Promise<{ out: string; code: number }> {
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
});
