import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    mkdtempSync,
    mkdirSync,
    rmSync,
    realpathSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    chmodSync,
    existsSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join, relative } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { createHash } from 'crypto';

import { run } from '../useCases/work.ts';
import { COMMAND_CATALOG } from '../useCases/catalog.ts';
import { generate_prompt } from '../../Core/useCases/index.ts';

// SPEC-suspec-v2 AC-004..009: `suspec work <SPEC>` re-rooted onto the STORE. Resolve the spec from
// the store's flat spec-*.md files + the runner from suspec.config.json `runners`, gate on spec
// staleness and the run lock, create/reuse the `suspec/<slug>` worktree, run the env-complete
// setup, write the run file into the store, and launch the runner with a store-pointing prompt.
// Verified end-to-end with a STUB runner (a shell script recording cwd.txt + arg.txt), the store
// rooted in a per-test temp dir via SUSPEC_STATE_DIR.

// Repo-relative file paths under `dir`, skipping `.git` and `.worktrees` (the agent's space) —
// used to prove suspec writes NOTHING in the repo itself (the record lives in the store).
function filesUnder(dir: string, base = dir): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === '.worktrees') {
            continue;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...filesUnder(full, base));
        } else {
            out.push(relative(base, full));
        }
    }
    return out.sort();
}

// A store spec whose single AC's Verify clause names a runtime command ("a test") — setup
// failures BLOCK under it (AC-005).
const SPEC = `---
type: spec
id: SPEC-feat
status: ready
grammar_version: 1
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.

## Non-goals

- none.
`;

// A spec whose Verify clause names NO runtime command — setup failures only warn under it.
const SPEC_NO_RUNTIME = SPEC.replace('Verify with: a test.', 'Verify with: reading the doc aloud with the owner.');

let root: string;
let repo: string;
let stateRoot: string;
let store: string;
let savedStateDir: string | undefined;

const git = (args: string[], cwd = repo): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

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

// Build a git repo + its STORE: the store dir carries the .repo-path marker (resolution matches by
// recorded path) and a spec-feat.md; the repo carries a suspec.config.json whose `runners` map
// points the default at a stub script. No `.suspec/` dir and no repo `specs/` dir exist.
function buildWork(
    opts: {
        spec?: string;
        exit?: number;
        stubScript?: string;
        template?: string; // overrides the stub's command_template
        config?: Record<string, unknown>; // extra suspec.config.json keys (setup, setup_copy, …)
        noConfig?: boolean;
    } = {}
): { stub: string } {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);

    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'spec-feat.md'), opts.spec ?? SPEC);

    const stub = join(root, 'stub-agent.sh');
    writeFileSync(
        stub,
        opts.stubScript ?? `#!/bin/sh\npwd -P > cwd.txt\nprintf '%s' "$1" > arg.txt\nexit ${opts.exit ?? 0}\n`
    );
    chmodSync(stub, 0o755);

    if (opts.noConfig !== true) {
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({
                runners: { default: 'stub', stub: { command_template: opts.template ?? `${stub} {prompt}` } },
                ...(opts.config ?? {}),
            })
        );
    }
    writeFileSync(join(repo, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
    return { stub };
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-work-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    stateRoot = join(root, 'state');
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
    if (existsSync(store)) {
        chmodSync(store, 0o755); // a test may have locked the store down
    }
    rmSync(root, { recursive: true, force: true });
});

describe('suspec work — the spec resolves from the STORE (AC-004)', () => {
    it('resolves spec-<slug>.md by frontmatter id, creates suspec/<slug> under .worktrees/, launches there', () => {
        buildWork();
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        const worktree = join(repo, '.worktrees', 'feat');
        expect(existsSync(worktree)).toBe(true);
        expect(readFileSync(join(worktree, 'cwd.txt'), 'utf8').trim()).toBe(worktree);
        expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktree).trim()).toBe('suspec/feat');
    });

    it('resolves by the store filename slug too', () => {
        buildWork();
        const { code } = capture(() => run(['feat'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('a missing spec exits 2 NAMING the store path searched, creating nothing', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-nope'], repo));
        expect(code).toBe(2);
        expect(err).toContain(store);
        expect(err).toMatch(/no spec with that id or slug/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('never resolves from a repo specs/ dir — only the store counts', () => {
        buildWork();
        rmSync(join(store, 'spec-feat.md'));
        mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
        writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(2);
        expect(err).toContain(store);
    });

    it('creates the worktree once and reuses it on a relaunch (reused flag flips)', () => {
        buildWork();
        const first = capture(() => run(['SPEC-feat', '--json'], repo));
        expect(first.code).toBe(0);
        expect(JSON.parse(first.out).reused).toBe(false);
        const second = capture(() => run(['SPEC-feat', '--json'], repo));
        expect(second.code).toBe(0);
        expect(JSON.parse(second.out).reused).toBe(true);
        expect(readdirSync(join(repo, '.worktrees'))).toEqual(['feat']);
    });

    it('warns when reusing a worktree that has uncommitted changes', () => {
        buildWork();
        capture(() => run(['SPEC-feat'], repo)); // creates the worktree; the stub dirties it
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/reusing a worktree with uncommitted changes/);
    });
});

describe('suspec work — the prompt and the run file point into the store (AC-006)', () => {
    it('delivers a prompt carrying the ABSOLUTE spec + run-file store paths, no spec body, no other artifact', () => {
        buildWork();
        capture(() => run(['SPEC-feat'], repo));
        const delivered = readFileSync(join(repo, '.worktrees', 'feat', 'arg.txt'), 'utf8');
        expect(delivered).toContain(`the spec at ${join(store, 'spec-feat.md')}`);
        expect(delivered).toContain(`Your run file is ${join(store, 'run-feat.md')}`);
        expect(delivered).toMatch(/append your run and evidence notes/);
        expect(delivered).not.toContain('The tool must do it'); // no spec body copied
        expect(delivered).not.toMatch(/review-|finding-|intake-/); // no other artifact path
        // The delivered instruction is EXACTLY the generated prompt — no truncation, no extra text.
        expect(delivered).toBe(
            generate_prompt({
                specId: 'SPEC-feat',
                specPath: join(store, 'spec-feat.md'),
                runPath: join(store, 'run-feat.md'),
            })
        );
    });

    it('creates the run file in the store at launch — grammar-stamped, typed, locked — and releases it on exit', () => {
        buildWork();
        capture(() => run(['SPEC-feat'], repo));
        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toMatch(/^---\ntype: run\nspec: SPEC-feat\n/);
        expect(runFile).toContain(`worktree: ${join(repo, '.worktrees', 'feat')}`);
        expect(runFile).toContain('branch: suspec/feat');
        expect(runFile).toContain(`base_sha: ${git(['rev-parse', 'HEAD']).trim()}`);
        expect(runFile).toContain('grammar_version: 1');
        expect(runFile).toContain(`pid: ${process.pid}`);
        expect(runFile).toMatch(/heartbeat: \d{4}-\d{2}-\d{2}T/);
        // The runner exited: the lock is released, the exit recorded as a fact.
        expect(runFile).toContain('status: exited');
        expect(runFile).toContain('exit: 0');
    });

    it('writes NOTHING in the repo itself — no .suspec/ scratch, no record, no prompt file', () => {
        buildWork();
        const before = filesUnder(repo);
        capture(() => run(['SPEC-feat'], repo));
        expect(filesUnder(repo)).toEqual(before);
        expect(existsSync(join(repo, '.suspec'))).toBe(false);
    });
});

describe('suspec work — setup v2 (AC-005)', () => {
    it('runs declared setup commands in the worktree before launch', () => {
        const setup = join(root, 'setup-stub.sh');
        buildWork({ config: { setup: [setup] } });
        writeFileSync(setup, `#!/bin/sh\nprintf 'ok' > setup-ran.txt\n`);
        chmodSync(setup, 0o755);
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'setup-ran.txt'))).toBe(true);
    });

    it('copies setup_copy allowlisted gitignored files into the worktree', () => {
        buildWork({ config: { setup_copy: ['.env.local'] } });
        writeFileSync(join(repo, '.gitignore'), '.env.local\n');
        writeFileSync(join(repo, '.env.local'), 'SECRET=1');
        git(['add', '.gitignore']);
        git(['commit', '-m', 'ignore']);
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(readFileSync(join(repo, '.worktrees', 'feat', '.env.local'), 'utf8')).toBe('SECRET=1');
    });

    it('BLOCKS the launch (exit 1, nothing launched) when setup fails and the spec Verify names runtime commands', () => {
        const setup = join(root, 'setup-fail.sh');
        buildWork({ config: { setup: [setup] } }); // SPEC's Verify: "a test." → runtime
        writeFileSync(setup, `#!/bin/sh\nexit 2\n`);
        chmodSync(setup, 0o755);
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toMatch(/refusing to launch: setup failed/);
        expect(out).toMatch(/setup command failed \(exit 2\)/);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(false); // nothing launched
        expect(existsSync(join(store, 'run-feat.md'))).toBe(false); // no run file either
    });

    it('a refused setup_copy path (escaping the repo) blocks the same way', () => {
        buildWork({ config: { setup_copy: ['../outside.txt'] } });
        writeFileSync(join(root, 'outside.txt'), 'x');
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toMatch(/setup_copy failed — \.\.\/outside\.txt: path escapes the repo root/);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(false);
    });

    it('only WARNS and launches when setup fails but no Verify clause names a runtime command', () => {
        const setup = join(root, 'setup-fail.sh');
        buildWork({ spec: SPEC_NO_RUNTIME, config: { setup: [setup] } });
        writeFileSync(setup, `#!/bin/sh\nexit 2\n`);
        chmodSync(setup, 0o755);
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0); // launched; the agent exited 0
        expect(err).toMatch(/warning: setup command failed \(exit 2\)/);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('notes and proceeds when nothing is declared or detected', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/no setup declared or detected/);
    });
});

describe('suspec work — staleness at launch (AC-007)', () => {
    function buildStale(): void {
        buildWork();
        const base = git(['rev-parse', 'HEAD']).trim();
        writeFileSync(
            join(store, 'spec-feat.md'),
            SPEC.replace('grammar_version: 1\n', `grammar_version: 1\nbase_sha: ${base}\naffected_areas:\n  - src\n`)
        );
        mkdirSync(join(repo, 'src'), { recursive: true });
        writeFileSync(join(repo, 'src', 'drifted.ts'), 'drift');
        git(['add', '.']);
        git(['commit', '-m', 'drift']);
    }

    it('refuses a stale spec (exit 1) printing the drifted files, launching nothing', () => {
        buildStale();
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toMatch(/refusing to launch: SPEC-feat is stale/);
        expect(out).toMatch(/drifted: src\/drifted\.ts/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(existsSync(join(store, 'run-feat.md'))).toBe(false);
    });

    it('--anyway proceeds past the staleness, noting the drift', () => {
        buildStale();
        const { code, err } = capture(() => run(['SPEC-feat', '--anyway'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/launching anyway — 1 file\(s\) drifted/);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('a spec recording no base_sha launches without a staleness gate', () => {
        buildWork(); // SPEC carries no base_sha
        expect(capture(() => run(['SPEC-feat'], repo)).code).toBe(0);
    });
});

describe('suspec work — run lock + pid liveness + heartbeat (AC-008)', () => {
    // pid defaults to OUR OWN pid — provably alive, so "live" tests never depend on whether some
    // arbitrary number happens to be a running process on the host.
    const liveRun = (
        slug: string,
        heartbeat: string,
        worktree = '/live/wt',
        pid: number | 'none' = process.pid
    ): void => {
        const pidLine = pid === 'none' ? '' : `pid: ${pid}\n`;
        writeFileSync(
            join(store, `run-${slug}.md`),
            `---\ntype: run\nspec: SPEC-feat\nworktree: ${worktree}\nbranch: suspec/feat\nstatus: live\n${pidLine}heartbeat: ${heartbeat}\n---\n\nPREVIOUS BODY\n`
        );
    };

    // A pid that provably ran and exited: spawn a no-op child and wait for it.
    const deadPid = (): number => {
        const child = spawnSync('node', ['-e', '']);
        return child.pid;
    };

    it('a second work on a live spec (alive pid, fresh heartbeat) refuses, offering --attach and --second-worktree', () => {
        buildWork();
        liveRun('feat', new Date().toISOString());
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toMatch(/a live run already holds SPEC-feat/);
        expect(out).toMatch(new RegExp(`pid ${process.pid}`));
        expect(out).toMatch(/suspec work SPEC-feat --attach/);
        expect(out).toMatch(/suspec work SPEC-feat --second-worktree/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false); // dispatched nothing
    });

    it('an ALIVE pid outranks a decayed heartbeat — a long agent session is never hijacked', () => {
        buildWork();
        // The heartbeat decayed hours ago, but the recorded pid (our own) is alive: still LIVE.
        liveRun('feat', new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString());
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toMatch(/a live run already holds SPEC-feat/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('a DEAD pid outranks a fresh heartbeat — the crashed run is reclaimable immediately', () => {
        buildWork();
        liveRun('feat', new Date().toISOString(), '/live/wt', deadPid());
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/dead lock/);
        expect(err).toMatch(/reclaimable/);
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).toContain(`pid: ${process.pid}`); // re-stamped
    });

    it('--attach prints the runner-native attach hint and dispatches NOTHING (exit 0)', () => {
        buildWork();
        liveRun('feat', new Date().toISOString(), '/live/wt');
        const { code, out } = capture(() => run(['SPEC-feat', '--attach'], repo));
        expect(code).toBe(0);
        expect(out).toMatch(/attach with the runner's own session command/);
        expect(out).toContain('re-open your stub session in /live/wt'); // the stub runner's hint
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('--attach with no live run is a usage error (exit 2)', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-feat', '--attach'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/no live run for SPEC-feat/);
    });

    it('--second-worktree launches beside the live run: suffixed worktree + separate run file', () => {
        buildWork();
        const heartbeat = new Date().toISOString();
        liveRun('feat', heartbeat);
        const { code } = capture(() => run(['SPEC-feat', '--second-worktree'], repo));
        expect(code).toBe(0);
        const worktree = join(repo, '.worktrees', 'feat-2');
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
        expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktree).trim()).toBe('suspec/feat-2');
        const second = readFileSync(join(store, 'run-feat-2.md'), 'utf8');
        expect(second).toContain(`worktree: ${worktree}`);
        // The primary run file is untouched — still the live sibling's record.
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).toContain(`heartbeat: ${heartbeat}`);
    });

    it('--second-worktree skips a live -2 sibling and lands on -3', () => {
        buildWork();
        liveRun('feat', new Date().toISOString());
        liveRun('feat-2', new Date().toISOString());
        const { code } = capture(() => run(['SPEC-feat', '--second-worktree'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat-3', 'cwd.txt'))).toBe(true);
    });

    it('with NO recorded pid the heartbeat rule still governs: dead heartbeat → reclaimed, body preserved', () => {
        buildWork();
        liveRun('feat', new Date(Date.now() - 16 * 60 * 1000).toISOString(), '/live/wt', 'none');
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/reclaimable/);
        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toContain(`pid: ${process.pid}`); // re-stamped
        expect(runFile).toContain('status: exited'); // …and released after the stub exited
        expect(runFile).toContain('PREVIOUS BODY'); // the agent-written body survived
    });

    it('appends a launch line to the capture ledger binding the run to the spec id + content hash', () => {
        buildWork();
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        const ledgerPath = join(stateRoot, '.captures', `${basename(repo)}.jsonl`);
        const entries = readFileSync(ledgerPath, 'utf8')
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        const launch = entries.find((entry) => entry.kind === 'launch');
        expect(launch).toMatchObject({ run: 'feat', spec_id: 'SPEC-feat' });
        expect(launch.spec_sha256).toBe(createHash('sha256').update(SPEC, 'utf8').digest('hex'));
    });

    it('a launch that cannot be ledgered degrades to a warning — the launch itself still happens', () => {
        buildWork();
        writeFileSync(join(stateRoot, '.captures'), 'a file squatting where the ledger dir must go');
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0); // launched fine
        expect(err).toMatch(/warning: could not record the launch in the capture ledger/);
    });

    it('relaunching a TERMINAL run prints the reopening note (was done)', () => {
        buildWork();
        writeFileSync(
            join(store, 'run-feat.md'),
            `---\ntype: run\nspec: SPEC-feat\nworktree: /old/wt\nbranch: suspec/feat\nstatus: done\npid: 1\nheartbeat: 2026-01-01T00:00:00.000Z\n---\n\nFINISHED BODY\n`
        );
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/reopening a completed run \(was done\)/);
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).toContain('FINISHED BODY');
    });
});

describe('suspec work — runner adapters from suspec.config.json (AC-009)', () => {
    it('renders {store} and {cwd} placeholders in a config template (post-split, one token each)', () => {
        const probe = join(root, 'probe.sh');
        writeFileSync(probe, `#!/bin/sh\nprintf '%s|%s|%s' "$1" "$2" "$3" > probe.txt\n`);
        chmodSync(probe, 0o755);
        buildWork({ template: `${probe} --store={store} --cwd={cwd} {prompt}` });
        capture(() => run(['SPEC-feat'], repo));
        const worktree = join(repo, '.worktrees', 'feat');
        const [storeArg, cwdArg, promptArg] = readFileSync(join(worktree, 'probe.txt'), 'utf8').split('|');
        expect(storeArg).toBe(`--store=${store}`);
        expect(cwdArg).toBe(`--cwd=${worktree}`);
        expect(promptArg).toContain('Suspec spec SPEC-feat');
    });

    it('an unknown --runner exits 2 listing the known runners (config + built-ins), launching nothing', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-feat', '--runner', 'nope'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/unknown runner "nope" — known runners: claude, codex, stub/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(existsSync(join(store, 'run-feat.md'))).toBe(false);
    });

    it('never reads the retired .suspec/config.yaml — the runners map wins even when one is present', () => {
        const { stub } = buildWork();
        const decoy = join(root, 'decoy.sh');
        writeFileSync(decoy, `#!/bin/sh\nprintf 'decoy' > decoy.txt\nexit 7\n`);
        chmodSync(decoy, 0o755);
        mkdirSync(join(repo, '.suspec'), { recursive: true });
        writeFileSync(
            join(repo, '.suspec', 'config.yaml'),
            `agents:\n  default: decoy\n  decoy:\n    command: ${decoy}\n`
        );
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0); // the json-configured stub ran (exit 0), not the yaml decoy (exit 7)
        const worktree = join(repo, '.worktrees', 'feat');
        expect(existsSync(join(worktree, 'decoy.txt'))).toBe(false);
        expect(readFileSync(join(worktree, 'arg.txt'), 'utf8')).toContain('Suspec spec SPEC-feat');
        expect(stub).toBeTruthy();
    });

    it('the retired --agent and --task flags fail loudly (exit 2)', () => {
        buildWork();
        const agent = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(agent.code).toBe(2);
        expect(agent.err).toMatch(/--agent is retired.*--runner/);
        const task = capture(() => run(['SPEC-feat', '--task', 'TASK-x'], repo));
        expect(task.code).toBe(2);
        expect(task.err).toMatch(/--task is retired/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });
});

describe('suspec work — --dry-run previews without mutating', () => {
    it('prints the store-rooted plan + prompt and writes/creates/launches nothing', () => {
        buildWork({ config: { setup_copy: ['.env.local'] } });
        writeFileSync(join(repo, 'pnpm-lock.yaml'), ''); // autodetect source (uncommitted is fine)
        const beforeRepo = filesUnder(repo);
        const beforeStore = readdirSync(store).sort();
        const { out, code } = capture(() => run(['SPEC-feat', '--dry-run'], repo));
        expect(code).toBe(0);
        expect(out).toMatch(/dry run/);
        expect(out).toContain(`spec:     ${join(store, 'spec-feat.md')}`);
        expect(out).toContain('runner:   stub');
        expect(out).toMatch(/branch: {3}suspec\/feat/);
        expect(out).toContain(`run file: ${join(store, 'run-feat.md')}`);
        expect(out).toContain('pnpm install (autodetect)');
        expect(out).toContain('copy:     .env.local');
        expect(out).toContain('Suspec spec SPEC-feat'); // the prompt is shown
        // Nothing mutated in the repo OR the store: no worktree, no run file.
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(filesUnder(repo)).toEqual(beforeRepo);
        expect(readdirSync(store).sort()).toEqual(beforeStore);
    });

    it('renders "(none)" for an empty setup plan', () => {
        buildWork();
        const { out } = capture(() => run(['SPEC-feat', '--dry-run'], repo));
        expect(out).toMatch(/setup: {4}\(none\)/);
        expect(out).toMatch(/copy: {5}\(none\)/);
    });
});

describe('suspec work — verdict-free reporting and exits', () => {
    it('--json reports the launch facts (spec, runner, worktree, run_file, exit) and no verdict keys', () => {
        buildWork();
        const { out, code } = capture(() => run(['SPEC-feat', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.spec).toBe('SPEC-feat');
        expect(parsed.runner).toBe('stub');
        expect(parsed.worktree).toBe(join(repo, '.worktrees', 'feat'));
        expect(parsed.run_file).toBe(join(store, 'run-feat.md'));
        expect(parsed.spec_path).toBe(join(store, 'spec-feat.md'));
        expect(typeof parsed.exit).toBe('number');
        for (const key of ['result', 'verdict', 'decision', 'suggestedDecision']) {
            expect(Object.keys(parsed)).not.toContain(key);
        }
        expect(out).not.toMatch(/"status"\s*:\s*"pass"/);
    });

    it('a non-zero agent exit is suspec exit 1, recorded in the run file as a fact', () => {
        buildWork({ exit: 3 });
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toContain('exit: 3');
        expect(runFile).toContain('status: exited');
    });

    it('an unlaunchable runner exits 2 and releases the lock (status aborted) so the next work is not blocked', () => {
        buildWork({ template: '/nonexistent/suspec-runner-xyz {prompt}' });
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/could not launch runner/);
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).toContain('status: aborted');
    });

    it('exits 2 with no spec arg (naming the by-hand fallback), outside a git repo, and on a bad/flag-shaped --base', () => {
        const usage = capture(() => run([], repo));
        expect(usage.code).toBe(2);
        expect(usage.err).toMatch(/by hand/);

        const notRepo = join(root, 'not-a-repo');
        mkdirSync(notRepo, { recursive: true });
        expect(capture(() => run(['SPEC-feat'], notRepo)).code).toBe(2);

        buildWork();
        const injected = capture(() => run(['SPEC-feat', '--base', '--foo'], repo));
        expect(injected.code).toBe(2);
        expect(injected.err).toMatch(/invalid --base value/);
        expect(capture(() => run(['SPEC-feat', '--base', 'no-such-ref-xyz'], repo)).code).toBe(2);
        // The good-base path still works.
        expect(capture(() => run(['SPEC-feat', '--base', 'HEAD'], repo)).code).toBe(0);
    });

    it('exits 2 when the store cannot be resolved (state root is a file)', () => {
        buildWork();
        rmSync(stateRoot, { recursive: true, force: true });
        writeFileSync(stateRoot, 'not a dir');
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(2);
    });

    it('exits 2 when the run file cannot be written (store dir read-only), launching nothing', () => {
        buildWork();
        chmodSync(store, 0o555);
        try {
            const { code, err } = capture(() => run(['SPEC-feat'], repo));
            expect(code).toBe(2);
            expect(err).toMatch(/Atomic write failed/);
            expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(false);
        } finally {
            chmodSync(store, 0o755);
        }
    });

    it('degrades to a warning when the agent DELETED the run file mid-run — no exit recorded, no crash', () => {
        buildWork({ stubScript: `#!/bin/sh\nrm -f ${join(store, 'run-feat.md')}\nexit 0\n` });
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/disappeared during the run — no exit recorded/);
    });

    it('degrades to a warning when the exit cannot be recorded (store locked down mid-run)', () => {
        buildWork({ stubScript: `#!/bin/sh\nchmod 555 ${store}\nexit 0\n` });
        try {
            const { code, err } = capture(() => run(['SPEC-feat'], repo));
            expect(code).toBe(0);
            expect(err).toMatch(/could not record the runner exit/);
        } finally {
            chmodSync(store, 0o755);
        }
    });
});

describe('suspec work — the by-hand fallback is documented', () => {
    it('the catalog usage names the no-CLI path against the store spec', () => {
        const work = COMMAND_CATALOG.find((c) => c.name === 'work');
        expect(work).toBeDefined();
        expect(work?.usage.join('\n')).toMatch(/by hand.*create the worktree.*store spec/s);
    });
});

describe('suspec work — ambient decay (SPEC-suspec-v2 AC-019)', () => {
    const DECAY_LINE = /1 stale — suspec store doctor/;

    it('prints ONE decay line on stderr when the store holds a dead-heartbeat live run', () => {
        buildWork();
        writeFileSync(
            join(store, 'run-other.md'),
            '---\ntype: run\nstatus: live\npid: 1\nheartbeat: 2001-01-01T00:00:00Z\n---\n'
        );
        const { code, err } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(err.match(/stale — suspec store doctor/g)).toHaveLength(1);
        expect(err).toMatch(DECAY_LINE);
    });

    it('prints no decay line when nothing decayed', () => {
        buildWork();
        const { err } = capture(() => run(['SPEC-feat'], repo));
        expect(err).not.toMatch(/stale — suspec store doctor/);
    });
});

describe('suspec work — the WIP cap (SPEC-suspec-v2 AC-019)', () => {
    function add_active_specs(count: number): void {
        for (let n = 0; n < count; n += 1) {
            writeFileSync(
                join(store, `spec-busy-${n}.md`),
                `---\ntype: spec\nid: SPEC-busy-${n}\nstatus: ready\n---\n`
            );
        }
    }

    it('the 4th active spec refuses under the default cap (3), launching nothing', () => {
        buildWork();
        add_active_specs(3); // + spec-feat = the 4th
        const { code, out } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(1);
        expect(out).toContain('refusing to launch: 3 active spec(s) already fill the wip cap (3)');
        expect(out).toContain('--anyway');
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(existsSync(join(store, 'run-feat.md'))).toBe(false);
    });

    it('--anyway overrides the cap', () => {
        buildWork();
        add_active_specs(3);
        const { code } = capture(() => run(['SPEC-feat', '--anyway'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('the COUNT METHOD: relaunching an already-active spec occupies no new slot; drafts never count', () => {
        buildWork();
        add_active_specs(2); // feat + 2 others = exactly at the cap, feat itself excluded → 2 < 3
        writeFileSync(join(store, 'spec-draft.md'), '---\ntype: spec\nid: SPEC-draft\nstatus: draft\n---\n');
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
    });

    it('wip_cap is config-overridable (suspec.config.json)', () => {
        buildWork({ config: { wip_cap: 10 } });
        add_active_specs(5);
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
    });

    it('--dry-run previews without tripping the cap (it launches nothing)', () => {
        buildWork();
        add_active_specs(3);
        const { code, out } = capture(() => run(['SPEC-feat', '--dry-run'], repo));
        expect(code).toBe(0);
        expect(out).toContain('dry run');
    });

    it('the refusal is machine-readable under --json', () => {
        buildWork();
        add_active_specs(3);
        const { code, out } = capture(() => run(['SPEC-feat', '--json'], repo));
        expect(code).toBe(1);
        expect(JSON.parse(out)).toMatchObject({
            level: 'warning',
            refused: 'wip-cap',
            wip_cap: 3,
            active: ['SPEC-busy-0', 'SPEC-busy-1', 'SPEC-busy-2'],
        });
    });
});
