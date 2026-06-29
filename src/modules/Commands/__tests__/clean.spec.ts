import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/clean.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-clean-cmd-'));
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

describe('clean command (SPEC-suspec-clean)', () => {
    it('reports spent artifacts with counts and exits 0 (dry run)', () => {
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

    it('--apply without a git repo errors clearly (cannot tell gitignored from committed)', () => {
        writeArtifact('reviews', 'r-passed.md', 'pass'); // ws is a bare tmpdir, not a git repo
        const { code } = capture(() => run(['--apply'], ws));
        expect(code).not.toBe(0);
    });

    it('--json emits the structured report', () => {
        writeArtifact('tasks', 'TASK-done.md', 'closed');
        const { out } = capture(() => run(['--json'], ws));
        const parsed = JSON.parse(out) as { candidates: { path: string }[]; keptCount: number };
        expect(parsed.candidates[0].path).toBe('tasks/TASK-done.md');
        expect(parsed.keptCount).toBe(0);
    });

    it('--apply prunes in a git repo: deletes a gitignored spent task, exits 0', () => {
        const repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-clean-apply-')));
        execFileSync('git', ['init'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(join(repo, '.gitignore'), 'tasks/\n');
        writeFileSync(join(repo, 'tasks', 'TASK-done.md'), '---\ntype: task\nstatus: closed\n---\n');
        const { out, code } = capture(() => run(['--apply'], repo));
        const fileGone = !existsSync(join(repo, 'tasks', 'TASK-done.md'));
        rmSync(repo, { recursive: true, force: true });
        expect(code).toBe(0);
        expect(out).toContain('1 deleted, 0 archived');
        expect(out).toContain('tasks/TASK-done.md');
        expect(fileGone).toBe(true);
    });

    it('--apply archives a committed spent review (kept in the tree under archive/)', () => {
        const repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-clean-arch-')));
        execFileSync('git', ['init'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'r.md'), '---\ntype: review\nstatus: pass\n---\n');
        execFileSync('git', ['add', '.'], { cwd: repo });
        execFileSync('git', ['commit', '-m', 'review'], { cwd: repo });
        const { out, code } = capture(() => run(['--apply'], repo));
        const archived = existsSync(join(repo, 'archive', 'reviews', 'r.md'));
        rmSync(repo, { recursive: true, force: true });
        expect(code).toBe(0);
        expect(out).toContain('0 deleted, 1 archived');
        expect(archived).toBe(true);
    });

    it('--apply in a clean repo with nothing spent says so', () => {
        const repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-clean-empty-')));
        execFileSync('git', ['init'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
        const { out, code } = capture(() => run(['--apply'], repo));
        rmSync(repo, { recursive: true, force: true });
        expect(code).toBe(0);
        expect(out).toContain('nothing spent');
    });
});
