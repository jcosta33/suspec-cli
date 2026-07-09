import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    symlinkSync,
    utimesSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/store.ts';
import { create_mock_prompter } from '../../Tui/testing/mockPrompter.ts';

// SPEC-suspec-v2 AC-018/AC-020: `suspec store doctor|list|gc|purge`. Doctor derives terminal
// states from git/GitHub truth (real git branches; PATH-stubbed gh for PR states), archives
// (never deletes), lists orphans, exits 0. list/gc/purge are the structural anti-rot faces.

let root: string;
let repo: string;
let stateRoot: string;
let store: string;
let ghState: string;
let savedStateDir: string | undefined;
let savedPath: string | undefined;
let savedGhState: string | undefined;

const git = (args: string[], cwd = repo): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

// The gh stub: `pr view <branch> --json state` answered from GH_STUB_STATE/pr-states.json
// (branch → state); an unmapped branch means no PR (exit 1).
const GH_STUB = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = process.env.GH_STUB_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
if (args[0] === 'pr' && args[1] === 'view') {
    const mapFile = path.join(dir, 'pr-states.json');
    const states = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
    const state = states[args[2]];
    if (!state) process.exit(1);
    process.stdout.write(JSON.stringify({ state }));
    process.exit(0);
}
process.exit(1);
`;

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

function write_run(name: string, branch: string | null, worktree: string | null, status = 'exited'): void {
    const lines = ['---', 'type: run', `status: ${status}`];
    if (branch !== null) {
        lines.push(`branch: ${branch}`);
    }
    if (worktree !== null) {
        lines.push(`worktree: ${worktree}`);
    }
    lines.push('---', '', '# Run', '', 'agent notes', '');
    writeFileSync(join(store, name), lines.join('\n'));
}

// All store files, root + archive, as `archive/…`-prefixed relative names — the never-deletes proof.
function all_store_files(): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(store)) {
        if (entry === 'archive') {
            out.push(...readdirSync(join(store, 'archive')).map((name) => `archive/${name}`));
        } else {
            out.push(entry);
        }
    }
    return out.sort();
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-store-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);

    ghState = join(root, 'gh-state');
    mkdirSync(ghState, { recursive: true });
    const stubDir = join(root, 'stub-bin');
    mkdirSync(stubDir, { recursive: true });
    writeFileSync(join(stubDir, 'gh'), GH_STUB);
    chmodSync(join(stubDir, 'gh'), 0o755);

    savedStateDir = process.env.SUSPEC_STATE_DIR;
    savedPath = process.env.PATH;
    savedGhState = process.env.GH_STUB_STATE;
    process.env.SUSPEC_STATE_DIR = stateRoot;
    process.env.PATH = `${stubDir}:${process.env.PATH ?? ''}`;
    process.env.GH_STUB_STATE = ghState;
});

afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    process.env.PATH = savedPath;
    if (savedGhState === undefined) {
        delete process.env.GH_STUB_STATE;
    } else {
        process.env.GH_STUB_STATE = savedGhState;
    }
    rmSync(root, { recursive: true, force: true });
});

describe('store doctor — terminal signals from git truth (AC-018)', () => {
    it('a MERGED branch archives the run AND its spec — moved byte-identical, never deleted', async () => {
        git(['checkout', '-b', 'suspec/feat']);
        writeFileSync(join(repo, 'work.txt'), 'done');
        git(['add', '.']);
        git(['commit', '-m', 'work']);
        git(['checkout', 'main']);
        git(['merge', '--no-ff', 'suspec/feat']);
        writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n\n# S\n');
        write_run('run-feat.md', 'suspec/feat', repo); // worktree present — merged wins anyway
        const specBytes = readFileSync(join(store, 'spec-feat.md'), 'utf8');
        const runBytes = readFileSync(join(store, 'run-feat.md'), 'utf8');
        const before = all_store_files();

        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('run-feat.md: branch-merged → archived');
        expect(out).toContain('spec-feat.md: branch-merged → archived');
        expect(readFileSync(join(store, 'archive', 'spec-feat.md'), 'utf8')).toBe(specBytes);
        expect(readFileSync(join(store, 'archive', 'run-feat.md'), 'utf8')).toBe(runBytes);
        expect(existsSync(join(store, 'run-feat.md'))).toBe(false);
        // Nothing was unlinked: same file set, only relocated.
        expect(all_store_files().length).toBe(before.length);
    });

    it('a GONE worktree (branch still real, unmerged) archives; a present worktree is left', async () => {
        git(['checkout', '-b', 'suspec/feat']);
        writeFileSync(join(repo, 'wip.txt'), 'wip');
        git(['add', '.']);
        git(['commit', '-m', 'wip']);
        git(['checkout', 'main']);
        write_run('run-feat.md', 'suspec/feat', join(repo, '.worktrees', 'feat')); // never created → gone

        git(['checkout', '-b', 'suspec/alive']);
        writeFileSync(join(repo, 'alive.txt'), 'x');
        git(['add', '.']);
        git(['commit', '-m', 'alive']);
        git(['checkout', 'main']);
        write_run('run-alive.md', 'suspec/alive', repo); // "worktree" exists → no signal

        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('run-feat.md: worktree-gone → archived');
        expect(out).toContain('run-alive.md: no signal → left');
        expect(existsSync(join(store, 'run-alive.md'))).toBe(true);
    });

    it('a CLOSED PR archives even when the local branch is already deleted (stubbed gh)', async () => {
        writeFileSync(join(ghState, 'pr-states.json'), JSON.stringify({ 'suspec/gone': 'CLOSED' }));
        write_run('run-gone.md', 'suspec/gone', '/nowhere');
        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('run-gone.md: pr-closed → archived');
        expect(existsSync(join(store, 'archive', 'run-gone.md'))).toBe(true);
    });

    it('an orphan (branch/worktree never existed, no PR) is LISTED, never archived; a live run is left', async () => {
        write_run('run-ghost.md', 'suspec/ghost', '/nowhere');
        write_run('run-null.md', null, null); // no branch/worktree recorded at all
        writeFileSync(
            join(store, 'run-live.md'),
            `---\ntype: run\nstatus: live\npid: 1\nheartbeat: ${new Date().toISOString()}\nbranch: suspec/live\n---\n`
        );
        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('orphans (never had a branch/worktree — left in place):');
        expect(out).toContain('run-ghost.md');
        expect(out).toContain('run-live.md: no signal → left (live run)');
        expect(existsSync(join(store, 'run-ghost.md'))).toBe(true);
        expect(existsSync(join(store, 'run-null.md'))).toBe(true);
        expect(existsSync(join(store, 'archive'))).toBe(false);
    });

    it('a never-launched spec (no branch) is left — awaiting work is not a terminal state', async () => {
        writeFileSync(join(store, 'spec-idle.md'), '---\ntype: spec\nid: SPEC-idle\nstatus: ready\n---\n');
        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('spec-idle.md: no signal → left');
        expect(existsSync(join(store, 'spec-idle.md'))).toBe(true);
    });

    it('gh ABSENT: PR checks are skipped with a note; git-truth signals still work; exit 0', async () => {
        const gitOnly = join(root, 'git-only-bin');
        mkdirSync(gitOnly);
        const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
        symlinkSync(realGit, join(gitOnly, 'git'));
        process.env.PATH = gitOnly;

        write_run('run-ghost.md', 'suspec/ghost', '/nowhere');
        const { code, err } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(err).toContain('gh is not installed — PR-state checks skipped');
    });

    it('--json exposes the machine report (artifacts, orphans, ghAvailable)', async () => {
        write_run('run-ghost.md', 'suspec/ghost', '/nowhere');
        const { code, out } = await capture(() => run(['doctor', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as { level: string; orphans: string[]; artifacts: unknown[]; ghAvailable: boolean };
        expect(parsed.level).toBe('clean');
        expect(parsed.orphans).toEqual(['run-ghost.md']);
        expect(parsed.ghAvailable).toBe(true);
    });

    it('an archive-namesake collision reports archive-failed and still exits 0', async () => {
        git(['checkout', '-b', 'suspec/feat']);
        writeFileSync(join(repo, 'w.txt'), 'w');
        git(['add', '.']);
        git(['commit', '-m', 'w']);
        git(['checkout', 'main']);
        git(['merge', '--no-ff', 'suspec/feat']);
        write_run('run-feat.md', 'suspec/feat', repo);
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'run-feat.md'), 'an older namesake');
        const { code, out } = await capture(() => run(['doctor'], repo));
        expect(code).toBe(0);
        expect(out).toContain('run-feat.md: branch-merged → archive-failed');
        expect(readFileSync(join(store, 'archive', 'run-feat.md'), 'utf8')).toBe('an older namesake'); // untouched
    });
});

describe('store path — the non-probe resolver an agent asks mid-session', () => {
    it('a fresh repo: prints the absolute store dir AND creates it (dir + .repo-path marker)', async () => {
        // Undo the fixture store so this repo genuinely has none yet.
        rmSync(store, { recursive: true, force: true });
        const { code, out } = await capture(() => run(['path'], repo));
        expect(code).toBe(0);
        expect(out.trim()).toBe(store);
        expect(existsSync(store)).toBe(true);
        expect(readFileSync(join(store, '.repo-path'), 'utf8').trim()).toBe(repo);
    });

    it('a collision-suffixed store: prints the suffixed dir recorded for THIS repo, never the basename guess', async () => {
        // The basename slot belongs to a DIFFERENT repo; this repo's store sits at `<base>-2`.
        rmSync(store, { recursive: true, force: true });
        const otherRepo = join(root, 'elsewhere', basename(repo));
        mkdirSync(otherRepo, { recursive: true });
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${otherRepo}\n`);
        const suffixed = `${store}-2`;
        mkdirSync(suffixed, { recursive: true });
        writeFileSync(join(suffixed, '.repo-path'), `${repo}\n`);

        const { code, out } = await capture(() => run(['path'], repo));
        expect(code).toBe(0);
        expect(out.trim()).toBe(suffixed);
    });

    it('--json carries { store } machine output', async () => {
        const { code, out } = await capture(() => run(['path', '--json'], repo));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', store });
    });
});

describe('store list / gc / purge (AC-020)', () => {
    it('list shows active + archived counts with per-artifact ages; --json is the stable face', async () => {
        writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\n---\n');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'finding-001.md'), 'x');
        const old = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);
        utimesSync(join(store, 'archive', 'finding-001.md'), old, old);

        const human = await capture(() => run(['list'], repo));
        expect(human.code).toBe(0);
        expect(human.out).toContain('active: 1');
        expect(human.out).toContain('archived: 1');
        expect(human.out).toContain('archive/finding-001.md  (finding, 12d)');

        const machine = await capture(() => run(['list', '--json'], repo));
        expect(JSON.parse(machine.out)).toMatchObject({
            level: 'clean',
            active_count: 1,
            archived_count: 1,
            active: [{ filename: 'spec-feat.md', kind: 'spec', ageDays: 0 }],
            archived: [{ filename: 'finding-001.md', kind: 'finding', ageDays: 12 }],
        });
    });

    it('gc deletes ONLY archive/ items past retention (config-overridable) and prints what died', async () => {
        writeFileSync(join(store, 'spec-old-root.md'), 'x');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'finding-old.md'), 'x');
        writeFileSync(join(store, 'archive', 'run-fresh.md'), 'x');
        const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
        utimesSync(join(store, 'archive', 'finding-old.md'), old, old);
        utimesSync(join(store, 'spec-old-root.md'), old, old);

        const { code, out } = await capture(() => run(['gc'], repo));
        expect(code).toBe(0);
        expect(out).toContain('deleted 1 archived artifact(s) past the 30d retention');
        expect(out).toContain('archive/finding-old.md');
        expect(existsSync(join(store, 'archive', 'finding-old.md'))).toBe(false);
        expect(existsSync(join(store, 'archive', 'run-fresh.md'))).toBe(true);
        expect(existsSync(join(store, 'spec-old-root.md'))).toBe(true); // the root is never gc'd

        // retention_days from suspec.config.json: everything stays inside a 1000d window.
        writeFileSync(join(store, 'archive', 'finding-old2.md'), 'x');
        utimesSync(join(store, 'archive', 'finding-old2.md'), old, old);
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ retention_days: 1000 }));
        const kept = await capture(() => run(['gc'], repo));
        expect(kept.code).toBe(0);
        expect(kept.out).toContain('nothing archived is past the 1000d retention');
        expect(existsSync(join(store, 'archive', 'finding-old2.md'))).toBe(true);
    });

    it('purge --force deletes the whole store dir', async () => {
        writeFileSync(join(store, 'spec-feat.md'), 'x');
        const { code, out } = await capture(() => run(['purge', '--force'], repo));
        expect(code).toBe(0);
        expect(out).toContain(`deleted ${store}`);
        expect(existsSync(store)).toBe(false);
    });

    it('purge refuses outside a TTY without --force (exit 2, store intact)', async () => {
        writeFileSync(join(store, 'spec-feat.md'), 'x');
        const { code, err } = await capture(() => run(['purge'], repo));
        expect(code).toBe(2);
        expect(err).toContain('refusing to purge outside a TTY');
        expect(existsSync(join(store, 'spec-feat.md'))).toBe(true);
    });

    it('purge at the prompt: the typed repo name purges; a wrong name aborts with nothing deleted', async () => {
        writeFileSync(join(store, 'spec-feat.md'), 'x');
        const wrong = await capture(() => run(['purge'], repo, create_mock_prompter({ text: ['nope'] })));
        expect(wrong.code).toBe(2);
        expect(wrong.err).toContain('purge aborted — the typed name did not match');
        expect(existsSync(store)).toBe(true);

        const right = await capture(() => run(['purge'], repo, create_mock_prompter({ text: [basename(repo)] })));
        expect(right.code).toBe(0);
        expect(existsSync(store)).toBe(false);
    });

    it('every subcommand is a clean no-op when the repo has no store yet (probe never creates one)', async () => {
        rmSync(store, { recursive: true, force: true });
        for (const sub of ['doctor', 'list', 'gc', 'purge', 'migrate']) {
            const { code, out } = await capture(() => run([sub], repo));
            expect(code).toBe(0);
            expect(out).toContain(`no store for this repo yet — nothing to ${sub}`);
            expect(existsSync(store)).toBe(false);
        }
    });

    it('migrate stamps a pre-versioned artifact and leaves a current one byte-untouched (AC-003)', async () => {
        writeFileSync(join(store, 'spec-old.md'), '---\ntype: spec\nid: SPEC-old\n---\n\nbody\n');
        const current = '---\ntype: spec\nid: SPEC-new\ngrammar_version: 1\n---\n\nbody\n';
        writeFileSync(join(store, 'spec-new.md'), current);
        const { code, out } = await capture(() => run(['migrate'], repo));
        expect(code).toBe(0);
        expect(out).toContain('upgraded: 1');
        expect(out).toContain('already current: 1');
        expect(readFileSync(join(store, 'spec-old.md'), 'utf8')).toContain('grammar_version: 1');
        expect(readFileSync(join(store, 'spec-new.md'), 'utf8')).toBe(current);
    });

    it('usage errors exit 2: no subcommand / an unknown one / outside a git repo', async () => {
        expect((await capture(() => run([], repo))).code).toBe(2);
        expect((await capture(() => run(['weed'], repo))).err).toContain('usage: suspec store');
        const bare = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-nogit-'));
        try {
            expect((await capture(() => run(['list'], bare))).code).toBe(2);
        } finally {
            rmSync(bare, { recursive: true, force: true });
        }
    });
});
