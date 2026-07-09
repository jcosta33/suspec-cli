import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { run } from '../useCases/status.ts';

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-status-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
});

// Claim the store slot for the repo (the .repo-path marker) and drop artifacts in.
function seed_store(): void {
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n\n# F\n');
    writeFileSync(join(store, 'run-old.md'), '---\ntype: run\nspec: SPEC-old\nstatus: done\n---\n\n# R\n');
}

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

describe('status command — the store summary (ADR-0137)', () => {
    it('no store yet → a friendly empty summary, exit 0 (never creates the store)', async () => {
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('no store for this repo yet');
    });

    it('renders the active artifacts with kind + age, and the attention ranking', async () => {
        seed_store();
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('2 active artifact(s)');
        expect(out).toContain('spec-feat.md');
        expect(out).toContain('run-old.md');
        // The ready spec ranks in the attention list with its work command.
        expect(out).toContain('suspec work SPEC-feat');
    });

    it('--json carries the raw listing + ranking, machine-readable', async () => {
        seed_store();
        const { code, out } = await capture(() => run(['--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as {
            active: { filename: string; kind: string }[];
            next: { kind: string; ref: string }[];
        };
        expect(parsed.active.map((a) => a.filename)).toEqual(['run-old.md', 'spec-feat.md']);
        expect(parsed.next.some((item) => item.kind === 'spec' && item.ref === 'SPEC-feat')).toBe(true);
    });

    it('a store with only archived artifacts reads calm — no attention items', async () => {
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'archive', 'spec-done.md'), '---\ntype: spec\nid: SPEC-done\n---\n');
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('0 active artifact(s), 1 archived');
        expect(out).not.toContain('attention:');
    });
});
