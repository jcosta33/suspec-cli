import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { run } from '../useCases/clean.ts';

// `suspec clean` is the short spelling of `suspec store gc` (ADR-0137): archive-only retention.

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-clean-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(join(store, 'archive'), { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
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

function age_file(path: string, days: number): void {
    const past = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    utimesSync(path, past, past);
}

describe('clean command — the store gc alias (ADR-0137)', () => {
    it('deletes ONLY archived artifacts past retention; active + fresh archive stay', async () => {
        writeFileSync(join(store, 'spec-live.md'), '---\ntype: spec\nid: SPEC-live\n---\n');
        age_file(join(store, 'spec-live.md'), 90); // active — old, but never gc'd
        writeFileSync(join(store, 'archive', 'spec-old.md'), 'old\n');
        age_file(join(store, 'archive', 'spec-old.md'), 90);
        writeFileSync(join(store, 'archive', 'spec-fresh.md'), 'fresh\n');

        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('spec-old.md');
        expect(existsSync(join(store, 'archive', 'spec-old.md'))).toBe(false);
        expect(existsSync(join(store, 'archive', 'spec-fresh.md'))).toBe(true);
        expect(existsSync(join(store, 'spec-live.md'))).toBe(true);
    });

    it('nothing past retention → a calm report, exit 0', async () => {
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('nothing archived is past');
    });

    it('no store → a friendly note, exit 0', async () => {
        rmSync(store, { recursive: true, force: true });
        const { code, out } = await capture(() => run([], repo));
        expect(code).toBe(0);
        expect(out).toContain('no store');
    });

    it('--json emits machine output', async () => {
        writeFileSync(join(store, 'archive', 'spec-old.md'), 'old\n');
        age_file(join(store, 'archive', 'spec-old.md'), 90);
        const { code, out } = await capture(() => run(['--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as { deleted: { filename: string }[] };
        expect(parsed.deleted.map((d) => d.filename)).toContain('spec-old.md');
    });
});
