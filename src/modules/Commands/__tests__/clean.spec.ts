import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/clean.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'corpus-clean-cmd-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

function writeArtifact(dir: string, name: string, status: string): void {
    mkdirSync(join(ws, dir), { recursive: true });
    writeFileSync(join(ws, dir, name), `---\ntype: ${dir === 'tasks' ? 'task' : 'review'}\nstatus: ${status}\n---\n`);
}

function capture(fn: () => number): { out: string; code: number } {
    const out: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        const code = fn();
        return { out: out.join(''), code };
    } finally {
        o.mockRestore();
    }
}

describe('clean command (SPEC-corpus-clean)', () => {
    it('reports spent artifacts with counts and exits 0 (read-only)', () => {
        writeArtifact('tasks', 'TASK-done.md', 'closed');
        writeArtifact('reviews', 'r-live.md', 'draft');
        const { out, code } = capture(() => run([], ws));
        expect(code).toBe(0);
        expect(out).toContain('1 prunable, 1 kept');
        expect(out).toContain('tasks/TASK-done.md');
        expect(out).toContain('status: closed — spent');
    });

    it('says so when nothing is spent', () => {
        writeArtifact('tasks', 'TASK-live.md', 'review-ready');
        const { out } = capture(() => run([], ws));
        expect(out).toContain('0 prunable, 1 kept');
        expect(out).toContain('nothing spent');
    });

    it('--apply prints the deferral notice and still deletes nothing', () => {
        writeArtifact('reviews', 'r-passed.md', 'pass');
        const { out } = capture(() => run(['--apply'], ws));
        expect(out).toContain('--apply is not wired yet');
        expect(out).toContain('reviews/r-passed.md'); // still reports the candidate
    });

    it('--json emits the structured report', () => {
        writeArtifact('tasks', 'TASK-done.md', 'closed');
        const { out } = capture(() => run(['--json'], ws));
        const parsed = JSON.parse(out) as { candidates: { path: string }[]; keptCount: number };
        expect(parsed.candidates[0].path).toBe('tasks/TASK-done.md');
        expect(parsed.keptCount).toBe(0);
    });
});
