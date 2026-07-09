import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    realpathSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/checkMyWork.ts';

// SPEC-suspec-v2 AC-021/AC-022: `suspec check-my-work "<intent>"` — the gate (config `verify`
// commands, exit mirrored) + one adversarial reviewer on the CURRENT repo diff, artifact-free
// unless --save, with the risk-path nudge on a `risk_paths` match. Real spawns (node + a stub
// runner script), a real git repo, the store rooted via SUSPEC_STATE_DIR.

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

// Every file under the state root, relative — the before/after snapshot proving NOTHING landed in
// the store without --save (AC-021).
function stateSnapshot(): string[] {
    if (!existsSync(stateRoot)) {
        return [];
    }
    const out: string[] = [];
    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const rel = `${prefix}${entry.name}`;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), `${rel}/`);
            } else {
                out.push(rel);
            }
        }
    };
    walk(stateRoot, '');
    return out.sort();
}

// A repo on its default branch with one commit; a stub runner recording cwd + the prompt arg.
function buildRepo(config: Record<string, unknown> | null = {}, stubExit = 0): { stub: string } {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    const stub = join(root, 'stub-runner.sh');
    writeFileSync(
        stub,
        `#!/bin/sh\npwd -P > reviewer-cwd.txt\nprintf '%s' "$1" > reviewer-arg.txt\nexit ${stubExit}\n`
    );
    chmodSync(stub, 0o755);
    if (config !== null) {
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({
                runners: { default: 'stub', stub: { command_template: `${stub} {prompt}` } },
                ...config,
            })
        );
    }
    writeFileSync(join(repo, 'seed.txt'), 'seed\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
    return { stub };
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-cmw-')));
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
    rmSync(root, { recursive: true, force: true });
});

describe('suspec check-my-work — the gate face (AC-021)', () => {
    it('runs every declared verify command in the repo root and exits 0 when all pass — writing NOTHING to the store', () => {
        buildRepo({
            verify: [
                'node -e require("fs").writeFileSync("ran1.txt","x")',
                'node -e require("fs").writeFileSync("ran2.txt","x")',
            ],
        });
        writeFileSync(join(repo, 'seed.txt'), 'changed\n'); // an uncommitted change — the diff
        const before = stateSnapshot();
        const result = capture(() => run(['tighten the parser', '--no-review'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('gate:     passed');
        // the commands really ran, in the REPO root (no worktree anywhere)
        expect(existsSync(join(repo, 'ran1.txt'))).toBe(true);
        expect(existsSync(join(repo, 'ran2.txt'))).toBe(true);
        // AC-021: no store artifacts without --save — snapshot unchanged (and no store at all)
        expect(stateSnapshot()).toEqual(before);
        expect(existsSync(store)).toBe(false);
    });

    it('mirrors the FIRST failing verify command as exit 1, still running the rest', () => {
        buildRepo({
            verify: ['node -e process.exit(5)', 'node -e require("fs").writeFileSync("still-ran.txt","x")'],
        });
        const result = capture(() => run(['x', '--no-review'], repo));
        expect(result.code).toBe(1);
        expect(result.out).toContain('gate:     blocked (exit 5)');
        expect(result.out).toContain('(exit 0)'); // the second command's row
        expect(existsSync(join(repo, 'still-ran.txt'))).toBe(true);
    });

    it('a verify command that cannot execute at all is exit 2 (like evidence add)', () => {
        buildRepo({ verify: ['suspec-no-such-binary-xyz'] });
        expect(capture(() => run(['x', '--no-review'], repo)).code).toBe(2);
    });

    it('no `verify` declared → a note and the gate is skipped (exit 0)', () => {
        buildRepo({});
        const result = capture(() => run(['x', '--no-review'], repo));
        expect(result.code).toBe(0);
        expect(result.err).toContain('no `verify` commands declared');
        expect(result.out).toContain('(none declared — skipped)');
    });

    it('usage errors exit 2: a missing/empty intent; outside a git repo', () => {
        buildRepo({});
        expect(capture(() => run([], repo)).code).toBe(2);
        expect(capture(() => run(['   '], repo)).code).toBe(2);
        const outside = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-cmw-nowhere-'));
        try {
            expect(capture(() => run(['x'], outside)).code).toBe(2);
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });
});

describe('suspec check-my-work — the review face (AC-021)', () => {
    it('dispatches the reviewer prompt (diff summary + intent) to the runner IN THE CURRENT DIR', () => {
        buildRepo({});
        // staged+unstaged on the default branch: a modified file + an untracked one
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        writeFileSync(join(repo, 'new-file.ts'), 'x\n');
        const result = capture(() => run(['tighten the parser'], repo));
        expect(result.code).toBe(0);
        const arg = readFileSync(join(repo, 'reviewer-arg.txt'), 'utf8');
        expect(arg).toContain('Stated intent: tighten the parser');
        expect(arg).toContain('- seed.txt');
        expect(arg).toContain('- new-file.ts');
        expect(arg).toContain('file:line');
        expect(arg).toContain('adversarially');
        // launched in the CURRENT dir — never a worktree
        expect(readFileSync(join(repo, 'reviewer-cwd.txt'), 'utf8').trim()).toBe(repo);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('diffs a feature branch against the merge-base with the default branch (committed work counts)', () => {
        buildRepo({});
        git(['checkout', '-b', 'feat/x']);
        writeFileSync(join(repo, 'committed.ts'), 'x\n');
        git(['add', 'committed.ts']);
        git(['commit', '-m', 'feat']);
        const result = capture(() => run(['ship it'], repo));
        expect(result.code).toBe(0);
        expect(readFileSync(join(repo, 'reviewer-arg.txt'), 'utf8')).toContain('- committed.ts');
    });

    it("the reviewer's exit never becomes the command's — exit mirrors the gate", () => {
        buildRepo({}, 3); // reviewer exits 3
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        const result = capture(() => run(['x'], repo));
        expect(result.code).toBe(0); // gate skipped (none declared) → clean
        expect(result.err).toContain('reviewer (stub) exited 3');
    });

    it('--no-review dispatches nothing; an empty diff skips the dispatch with a note', () => {
        buildRepo({});
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        expect(capture(() => run(['x', '--no-review'], repo)).code).toBe(0);
        expect(existsSync(join(repo, 'reviewer-arg.txt'))).toBe(false);
        git(['checkout', '--', 'seed.txt']); // clean tree again
        const empty = capture(() => run(['x'], repo));
        expect(empty.code).toBe(0);
        expect(empty.err).toContain('nothing to review');
        expect(existsSync(join(repo, 'reviewer-arg.txt'))).toBe(false);
    });

    it('--dry-run prints the plan + prompt and runs NOTHING (no gate, no dispatch, no store)', () => {
        buildRepo({ verify: ['node -e require("fs").writeFileSync("ran.txt","x")'] });
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        const before = stateSnapshot();
        const result = capture(() => run(['tighten the parser', '--dry-run', '--save'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('dry run');
        expect(result.out).toContain('Stated intent: tighten the parser');
        expect(existsSync(join(repo, 'ran.txt'))).toBe(false);
        expect(existsSync(join(repo, 'reviewer-arg.txt'))).toBe(false);
        expect(stateSnapshot()).toEqual(before);
    });

    it('an unknown runner exits 2, naming the known ones', () => {
        buildRepo({});
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        const result = capture(() => run(['x', '--runner', 'ghost'], repo));
        expect(result.code).toBe(2);
        expect(result.err).toContain('unknown runner "ghost"');
    });
});

describe('suspec check-my-work — degraded edges (AC-021)', () => {
    it('exits 2 when the diff base cannot be resolved (detached HEAD, no default branch)', () => {
        buildRepo({});
        git(['branch', '-m', 'trunk']); // neither main nor master exists …
        git(['checkout', '--detach']); // … and HEAD is detached → default_branch falls back to a missing 'main'
        expect(capture(() => run(['x', '--no-review'], repo)).code).toBe(2);
    });

    it('--dry-run renders the empty arms: no changes, no verify declared', () => {
        buildRepo({});
        const result = capture(() => run(['x', '--dry-run'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('(no changes)');
        expect(result.out).toContain('(none declared)');
    });

    it("the reviewer program failing to LAUNCH is suspec's own failure — exit 2", () => {
        buildRepo({});
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({
                runners: { default: 'stub', stub: { command_template: 'suspec-no-such-runner-xyz {prompt}' } },
            })
        );
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        expect(capture(() => run(['x'], repo)).code).toBe(2);
    });
});

describe('suspec check-my-work --save (AC-021)', () => {
    it('exit 2 when the store cannot resolve (--save with SUSPEC_STATE_DIR pointing at a file)', () => {
        buildRepo({});
        const asFile = join(root, 'state-as-file');
        writeFileSync(asFile, 'not a dir');
        process.env.SUSPEC_STATE_DIR = asFile;
        expect(capture(() => run(['x', '--save', '--no-review'], repo)).code).toBe(2);
    });

    it('exit 2 when the check run file cannot be written (read-only store)', () => {
        buildRepo({});
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        chmodSync(store, 0o555);
        try {
            expect(capture(() => run(['x', '--save', '--no-review'], repo)).code).toBe(2);
        } finally {
            chmodSync(store, 0o755);
        }
    });

    it('exit 2 when a verify command cannot execute under --save (nothing more recorded)', () => {
        buildRepo({ verify: ['suspec-no-such-binary-xyz'] });
        expect(capture(() => run(['x', '--save', '--no-review'], repo)).code).toBe(2);
    });

    it('an all-punctuation intent still derives a usable run slug (check-work)', () => {
        buildRepo({});
        expect(capture(() => run(['!!!', '--save', '--no-review'], repo)).code).toBe(0);
        expect(existsSync(join(store, 'run-check-work.md'))).toBe(true);
    });

    it('--save + review: the {store} placeholder renders the saved store dir; human output names the run file', () => {
        buildRepo({});
        // the stub template gets {store} appended so the dispatch records what it rendered to
        const stub = join(root, 'stub-store.sh');
        writeFileSync(stub, `#!/bin/sh\nprintf '%s' "$2" > store-arg.txt\nexit 0\n`);
        chmodSync(stub, 0o755);
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ runners: { default: 'stub', stub: { command_template: `${stub} {prompt} {store}` } } })
        );
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        const result = capture(() => run(['x', '--save'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('saved:');
        expect(result.out).toContain('run-check-x.md');
        expect(readFileSync(join(repo, 'store-arg.txt'), 'utf8')).toBe(store);
    });

    it('records a check run file + cli-verified evidence records in the store; exit still mirrors the gate', () => {
        buildRepo({ verify: ['node -e process.exit(0)', 'node -e process.exit(7)'] });
        writeFileSync(join(repo, 'seed.txt'), 'changed\n');
        const result = capture(() => run(['tighten the parser', '--save', '--no-review', '--json'], repo));
        expect(result.code).toBe(1); // second verify failed
        const value = JSON.parse(result.out) as { gate_exit: number; saved: { run_file: string } };
        expect(value.gate_exit).toBe(7);

        const runFile = readFileSync(join(store, 'run-check-tighten-the-parser.md'), 'utf8');
        expect(runFile).toContain('intent: tighten the parser');
        expect(runFile).toContain('status: exited');
        expect(runFile).toContain('exit: 7');
        expect(runFile).toContain('| VERIFY |'); // the evidence table rows landed

        const dir = join(store, 'evidence', 'check-tighten-the-parser');
        const names = readdirSync(dir).sort();
        expect(names.filter((n) => n.endsWith('.md'))).toHaveLength(2);
        expect(names.filter((n) => n.endsWith('.out'))).toHaveLength(2);
        const record = readFileSync(join(dir, names.find((n) => n.endsWith('.md'))!), 'utf8');
        expect(record).toContain('provenance: cli-verified');
        expect(record).toContain('ac: VERIFY');
    });
});

describe('suspec check-my-work — the risk-path nudge (AC-022)', () => {
    it('nudges on a risk_paths match (advisory, exit unchanged) and stays silent otherwise', () => {
        buildRepo({ risk_paths: ['src/auth/**'] });
        mkdirSync(join(repo, 'src', 'auth'), { recursive: true });
        writeFileSync(join(repo, 'src', 'auth', 'token.ts'), 'x\n');
        git(['add', 'src/auth/token.ts']); // staged — porcelain collapses an untracked DIR to `dir/`
        const hit = capture(() => run(['x', '--no-review'], repo));
        expect(hit.code).toBe(0); // never blocking
        expect(hit.err).toContain('risk path');
        expect(hit.err).toContain('src/auth/token.ts');

        git(['add', '.']);
        git(['commit', '-m', 'auth work']);
        writeFileSync(join(repo, 'README.md'), 'safe change\n');
        const miss = capture(() => run(['x', '--no-review'], repo));
        expect(miss.code).toBe(0);
        expect(miss.err).not.toContain('risk path');
    });
});
