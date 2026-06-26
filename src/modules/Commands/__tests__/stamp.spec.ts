import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/stamp.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

function capture(fn: () => number): { out: string; code: number } {
    const out: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
        const code = fn(); // call BEFORE joining out, else the writes are not yet captured
        return { out: out.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'corpus-stamp-cmd-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    writeFileSync(
        join(repo, 'specs', 'feat', 'spec.md'),
        '---\ntype: spec\nid: SPEC-feat\nstatus: active\nsources:\n  - self\n---\n\n## Requirements\n\n### AC-001 — one\nThe tool must do it.\nVerify with: a test.\n'
    );
    git(['add', '.']);
    git(['commit', '-m', 'base']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('stamp command', () => {
    it('stamps a spec snapshot and exits 0', () => {
        const { out, code } = capture(() => run(['feat'], repo));
        expect(code).toBe(0);
        expect(out).toContain('stamped spec');
        expect(out).toContain('snapshot:');
        expect(readFileSync(join(repo, 'specs', 'feat', 'spec.md'), 'utf8')).toContain('snapshot:');
    });

    it('emits --json', () => {
        const { out } = capture(() => run(['feat', '--json'], repo));
        const parsed = JSON.parse(out) as { kind: string; stamped: { snapshot: string } };
        expect(parsed.kind).toBe('spec');
        expect(parsed.stamped.snapshot).toMatch(/^[0-9a-f]{7,40}$/);
    });

    it('errors with usage when no ref is given', () => {
        const { code } = capture(() => run([], repo));
        expect(code).not.toBe(0);
    });

    it('errors when the ref matches nothing', () => {
        const { code } = capture(() => run(['nonexistent'], repo));
        expect(code).not.toBe(0);
    });

    it('accepts --repo pointing at the code repo', () => {
        const { code } = capture(() => run(['feat', '--repo', '.'], repo));
        expect(code).toBe(0);
    });

    it('rejects an invalid --repo value', () => {
        const { code } = capture(() => run(['feat', '--repo', '-x'], repo));
        expect(code).not.toBe(0);
    });

    it('errors when run outside a git repo (no --repo)', () => {
        const bare = realpathSync(mkdtempSync(join(tmpdir(), 'corpus-stamp-nogit-')));
        const { code } = capture(() => run(['feat'], bare));
        rmSync(bare, { recursive: true, force: true });
        expect(code).not.toBe(0);
    });
});
