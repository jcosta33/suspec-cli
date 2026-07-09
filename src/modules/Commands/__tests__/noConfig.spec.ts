import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { run as run_work } from '../useCases/work.ts';
import { run as run_write } from '../useCases/write.ts';
import { run as run_next } from '../useCases/next.ts';
import { run as run_store } from '../useCases/store.ts';
import { run as run_check } from '../useCases/check.ts';
import { run as run_new } from '../useCases/new.ts';
import { run as run_pull } from '../useCases/pull.ts';
import { run as run_check_my_work } from '../useCases/checkMyWork.ts';
import { run as run_promote } from '../useCases/promote.ts';

// SPEC-suspec-v2 AC-025 — graceful no-config degradation: every command works with NO
// suspec.config.json (defaults: store root, runner claude, no setup, no risk paths, default
// caps). Absence of config is never an error; a missing runtime dependency (gh for promotion)
// errors only on the command that needs it, naming it. This spec drives the loop in a CONFIG-LESS
// fixture repo end to end.

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

function capture(fn: () => number | Promise<number>): Promise<{ out: string; err: string; code: number }> {
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
    return Promise.resolve()
        .then(fn)
        .then((code) => ({ out: out.join(''), err: errs.join(''), code }))
        .finally(() => {
            o.mockRestore();
            e.mockRestore();
        });
}

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-noconfig-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
    // NO suspec.config.json — the whole point.
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

describe('the config-less loop (SPEC-suspec-v2 AC-025)', () => {
    it('write spec → work --dry-run → next → store list, all on defaults, no config anywhere', async () => {
        expect(existsSync(join(repo, 'suspec.config.json'))).toBe(false);

        // 1. `write spec` scaffolds the draft store spec.
        const wrote = await capture(() => run_write(['spec', 'No config feature'], repo));
        expect(wrote.code).toBe(0);
        expect(wrote.out).toContain('SPEC-no-config-feature');
        expect(existsSync(join(store, 'spec-no-config-feature.md'))).toBe(true);

        // 2. `work --dry-run` resolves the spec + the default runner (claude) with no setup and
        // launches nothing — absence of config is never an error.
        const worked = await capture(() => run_work(['SPEC-no-config-feature', '--dry-run', '--json'], repo));
        expect(worked.code).toBe(0);
        const plan = JSON.parse(worked.out) as { dry_run: boolean; runner: string; setup: unknown[] };
        expect(plan.dry_run).toBe(true);
        expect(String(plan.runner)).toContain('claude');
        // no worktree was created, no run file written
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(readdirSync(store).some((name) => name.startsWith('run-'))).toBe(false);

        // 3. `next` ranks the draft spec with zero config.
        const next = await capture(() => run_next([], repo));
        expect(next.code).toBe(0);
        expect(next.out).toContain('SPEC-no-config-feature');

        // 4. `store list` reads the store with the default retention settings.
        const listed = await capture(() => run_store(['list'], repo));
        expect(listed.code).toBe(0);
        expect(listed.out).toContain('spec-no-config-feature.md');

        // 5. `check` (no args) lints the store's artifacts — a draft spec skeleton lints clean.
        const checked = await capture(() => run_check([], repo));
        expect(checked.code).toBe(0);
        expect(checked.out).toContain('spec-no-config-feature.md');

        // 6. `new task` cuts a store slice; `pull` captures a store intake — still zero config.
        const cut = await capture(() => run_new(['task', '--from', 'SPEC-no-config-feature'], repo));
        expect(cut.code).toBe(0);
        expect(existsSync(join(store, 'task-no-config-feature.md'))).toBe(true);
        const pulled = await capture(() => run_pull(['JIRA-1'], repo));
        expect(pulled.code).toBe(0);
        expect(existsSync(join(store, 'intake-jira-1.md'))).toBe(true);
    });

    it('check-my-work --no-review with no verify config → note + gate skipped, exit 0', async () => {
        const result = await capture(() => run_check_my_work(['polish the thing', '--no-review'], repo));
        expect(result.code).toBe(0);
        expect(`${result.out}${result.err}`).toContain('no `verify` commands declared');
    });

    it('promote without gh on PATH errors naming gh — the config-less face (nothing changed)', async () => {
        // A minimal PATH carrying only git + node, so `gh` is genuinely absent.
        const bin = join(root, 'bin');
        mkdirSync(bin, { recursive: true });
        for (const tool of ['git', 'node'] as const) {
            const real = execFileSync('which', [tool], { encoding: 'utf8' }).trim();
            symlinkSync(real, join(bin, tool));
        }
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(
            join(store, 'finding-001.md'),
            '---\ntype: finding\nid: FIND-001\nrun: feat\nseverity: normal\n---\n\n# A finding\n\ndetails\n'
        );

        const savedPath = process.env.PATH;
        process.env.PATH = bin;
        try {
            const result = await capture(() => run_promote(['FIND-001'], repo));
            expect(result.code).toBe(1);
            expect(`${result.out}${result.err}`).toContain('gh');
            // nothing changed: the finding stays open in the store root
            expect(existsSync(join(store, 'finding-001.md'))).toBe(true);
        } finally {
            process.env.PATH = savedPath;
        }
    });
});
