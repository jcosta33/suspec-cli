import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/next.ts';

// SPEC-suspec-v2 AC-023: `suspec next` — the single most actionable store item, from the store
// ALONE: zero network, zero gh (proved with a tripwire gh on PATH), nothing written (the store is
// probed, never created).

let root: string;
let repo: string;
let stateRoot: string;
let store: string;
let savedStateDir: string | undefined;
let savedPath: string | undefined;
let ghMarker: string;

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
        const code = fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

function buildStore(): void {
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
}

function spec(slug: string, status: string): void {
    writeFileSync(
        join(store, `spec-${slug}.md`),
        `---\ntype: spec\nid: SPEC-${slug}\nstatus: ${status}\ngrammar_version: 1\n---\n\n## Requirements\n\n### AC-001 — one\n\nThe tool must do it.\n\nVerify with: a test.\n\n## Non-goals\n\n- none.\n`
    );
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-next-cmd-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'seed.txt'), 'seed\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;

    // The network tripwire: a fake `gh` FIRST on PATH that records any invocation and fails.
    // AC-023: `next` must never invoke it — the marker must not exist after any run.
    const stubBin = join(root, 'stub-bin');
    mkdirSync(stubBin, { recursive: true });
    ghMarker = join(root, 'gh-was-called.txt');
    const gh = join(stubBin, 'gh');
    writeFileSync(gh, `#!/bin/sh\necho "$@" > ${ghMarker}\nexit 1\n`);
    chmodSync(gh, 0o755);
    savedPath = process.env.PATH;
    process.env.PATH = `${stubBin}:${process.env.PATH ?? ''}`;
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    process.env.PATH = savedPath;
    rmSync(root, { recursive: true, force: true });
});

describe('suspec next (AC-023)', () => {
    it('a repo with no store: exit 0, "nothing actionable", and the store is NOT created (probe-only)', () => {
        const result = capture(() => run([], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('nothing actionable');
        expect(result.out).toContain('suspec write spec');
        expect(existsSync(store)).toBe(false);
        expect(existsSync(ghMarker)).toBe(false); // zero gh
    });

    it('a live run BEATS a ready spec; --json carries the full ranking; zero gh calls', () => {
        buildStore();
        spec('feat', 'live');
        spec('other', 'ready');
        writeFileSync(
            join(store, 'run-feat.md'),
            `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nstatus: live\npid: 1\nheartbeat: ${new Date().toISOString()}\n---\n`
        );
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nseverity: minor\n---\n'); // untriaged
        const result = capture(() => run(['--json'], repo));
        expect(result.code).toBe(0);
        const value = JSON.parse(result.out) as { top: { kind: string; ref: string }; items: { kind: string }[] };
        expect(value.top).toMatchObject({ kind: 'live-run', ref: 'feat' });
        expect(value.items.map((item) => item.kind)).toEqual(['live-run', 'triage', 'spec']);
        expect(existsSync(ghMarker)).toBe(false); // ranked findings + specs with ZERO network
    });

    it('prints THE top item human-readably, plus the ambient decay line for a dead-live run', () => {
        buildStore();
        spec('feat', 'live');
        writeFileSync(
            join(store, 'run-feat.md'),
            `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nstatus: live\npid: 1\nheartbeat: 2020-01-01T00:00:00Z\n---\n`
        );
        const result = capture(() => run([], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('next: run feat still claims live but its heartbeat is dead');
        expect(result.out).toContain('→ reclaim it: suspec work SPEC-feat');
        expect(result.err).toContain('stale — suspec store doctor'); // AC-019's shared decay line
        expect(existsSync(ghMarker)).toBe(false);
    });

    it('outside a git repo exits 2', () => {
        const outside = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-next-nowhere-'));
        try {
            expect(capture(() => run([], outside)).code).toBe(2);
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });
});
