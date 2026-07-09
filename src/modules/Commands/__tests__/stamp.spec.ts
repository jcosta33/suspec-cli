import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/stamp.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

function capture(fn: () => number): { out: string; err: string; code: number } {
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
        const code = fn(); // call BEFORE joining out, else the writes are not yet captured
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stamp-cmd-')));
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

    it('errors with usage when no ref is given — exit 2, usage on stderr', () => {
        const { code, err } = capture(() => run([], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage: suspec stamp');
    });

    it('errors when the ref matches nothing — exit 2, the miss named on stderr', () => {
        const { code, err } = capture(() => run(['nonexistent'], repo));
        expect(code).toBe(2);
        expect(err).toContain('cannot stamp nonexistent');
    });

    it('accepts --repo pointing at the code repo — and the stamp actually lands', () => {
        const { code, out } = capture(() => run(['feat', '--repo', '.'], repo));
        expect(code).toBe(0);
        expect(out).toContain('stamped spec');
        expect(readFileSync(join(repo, 'specs', 'feat', 'spec.md'), 'utf8')).toContain('snapshot:');
    });

    it('rejects an invalid --repo value — exit 2, the value named on stderr', () => {
        const { code, err } = capture(() => run(['feat', '--repo', '-x'], repo));
        expect(code).toBe(2);
        expect(err).toContain('invalid --repo value: "-x"');
    });

    it('errors when run outside a git repo (no --repo) — exit 2, the miss named on stderr', () => {
        const bare = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stamp-nogit-')));
        const { code, err } = capture(() => run(['feat'], bare));
        rmSync(bare, { recursive: true, force: true });
        expect(code).toBe(2);
        expect(err.toLowerCase()).toContain('git');
    });
});
