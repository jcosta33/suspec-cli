import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/evidence.ts';

// SPEC-suspec-v2 AC-010/AC-012: `suspec evidence add <RUN> --ac <AC> -- <cmd…>` end to end — the
// CLI itself runs the command in the run's worktree, stores raw output + the cli-verified record
// (capture block + staleness digest), appends the run-file table row, and MIRRORS the command's
// exit. Real spawns (node), a real git repo, the store rooted via SUSPEC_STATE_DIR.

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

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

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-evcmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    writeFileSync(join(repo, 'a.txt'), 'one\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    // The run's worktree is the repo itself — a real git checkout for the staleness digest.
    writeFileSync(
        join(store, 'run-feat.md'),
        `---\ntype: run\nspec: SPEC-feat\nworktree: ${repo}\nbranch: suspec/feat\nstatus: exited\n---\n\n# Run\n\nagent notes\n`
    );
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

describe('suspec evidence add (AC-010/AC-012)', () => {
    it('captures a passing command: exit 0, record + raw + run row + staleness digest', () => {
        const result = capture(() =>
            run(['add', 'feat', '--ac', 'AC-001', '--', 'node', '-e', 'console.log("SENTINEL-PASS")'], repo)
        );
        expect(result.code).toBe(0);
        expect(result.out).toContain('AC-001');
        expect(result.out).toContain('cli-verified');

        const dir = join(store, 'evidence', 'feat');
        const names = readdirSync(dir).sort();
        expect(names).toHaveLength(2); // <stem>.md + <stem>.out
        const record = readFileSync(join(dir, names.find((n) => n.endsWith('.md'))!), 'utf8');
        expect(record).toContain('provenance: cli-verified');
        expect(record).toContain('ac: AC-001');
        expect(record).toContain('exit: 0');
        expect(record).toMatch(/worktree_diff_sha: [0-9a-f]{64}/);
        expect(record).toMatch(/capture_sha256: [0-9a-f]{64}/);
        const raw = readFileSync(join(dir, names.find((n) => n.endsWith('.out'))!), 'utf8');
        expect(raw).toContain('SENTINEL-PASS');

        const runFile = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(runFile).toContain('agent notes'); // body preserved
        expect(runFile).toContain('| AC-001 | 0 | cli-verified |');
    });

    it('mirrors a failing command as exit 1 — the record is still written (a fail is evidence too)', () => {
        const result = capture(() =>
            run(['add', 'feat', '--ac', 'AC-002', '--json', '--', 'node', '-e', 'process.exit(5)'], repo)
        );
        expect(result.code).toBe(1);
        const value = JSON.parse(result.out) as { exit: number; level: string };
        expect(value.exit).toBe(5);
        const dir = join(store, 'evidence', 'feat');
        expect(readdirSync(dir).some((name) => name.endsWith('.md'))).toBe(true);
    });

    it('parse boundary: suspec flags stop at the FIRST `--`; everything after is command argv verbatim', () => {
        // `--json` BEFORE the `--` is suspec's own flag → machine output; the command never sees it.
        const jsonMode = capture(() =>
            run(
                [
                    'add',
                    'feat',
                    '--ac',
                    'AC-001',
                    '--json',
                    '--',
                    'node',
                    '-e',
                    'console.log(JSON.stringify(process.argv.slice(1)))',
                ],
                repo
            )
        );
        expect(jsonMode.code).toBe(0);
        const value = JSON.parse(jsonMode.out) as { level: string; ac: string }; // machine output = json mode held
        expect(value.ac).toBe('AC-001');

        // `--json` AFTER the `--` belongs to the CAPTURED COMMAND, not to suspec: the render stays
        // HUMAN (non-JSON) and the spawned process receives --json as its own argv.
        const human = capture(() => run(['add', 'feat', '--ac', 'AC-002', '--', 'echo', '--json'], repo));
        expect(human.code).toBe(0);
        expect(() => JSON.parse(human.out)).toThrow(); // human render, never machine output
        expect(human.out).toContain('cli-verified');
        // The raw capture proves the child process got `--json` as ITS argv: echo printed it back.
        const dir = join(store, 'evidence', 'feat');
        const recordName = readdirSync(dir).find(
            (n) => n.endsWith('.md') && readFileSync(join(dir, n), 'utf8').includes('ac: AC-002')
        );
        expect(recordName).toBeDefined();
        const raw = readFileSync(join(dir, recordName!.replace(/\.md$/, '.out')), 'utf8');
        expect(raw).toContain('--json');
    });

    it('runs the command IN the run worktree', () => {
        capture(() =>
            run(['add', 'feat', '--ac', 'AC-001', '--', 'node', '-e', 'console.log("cwd:" + process.cwd())'], repo)
        );
        const dir = join(store, 'evidence', 'feat');
        const raw = readFileSync(join(dir, readdirSync(dir).find((n) => n.endsWith('.out'))!), 'utf8');
        expect(raw).toContain(`cwd:${repo}`);
    });

    it('rejects malformed invocations with exit 2, writing nothing', () => {
        expect(capture(() => run([], repo)).code).toBe(2); // no subcommand
        expect(capture(() => run(['add'], repo)).code).toBe(2); // no run ref
        expect(capture(() => run(['add', '../escape', '--ac', 'AC-001', '--', 'true'], repo)).code).toBe(2); // path-shaped ref
        expect(capture(() => run(['add', 'feat', '--', 'true'], repo)).code).toBe(2); // no --ac
        expect(capture(() => run(['add', 'feat', '--ac', 'not-an-id', '--', 'true'], repo)).code).toBe(2); // bad AC shape
        expect(capture(() => run(['add', 'feat', '--ac', 'AC-001'], repo)).code).toBe(2); // no command
        expect(existsSync(join(store, 'evidence'))).toBe(false);
    });

    it('exit 2 for an unknown run, a command that cannot execute, and a non-repo cwd', () => {
        const unknown = capture(() => run(['add', 'ghost', '--ac', 'AC-001', '--', 'true'], repo));
        expect(unknown.code).toBe(2);
        expect(unknown.err).toContain('run-ghost.md');

        const noExec = capture(() =>
            run(['add', 'feat', '--ac', 'AC-001', '--', 'suspec-no-such-binary-xyz'], repo)
        );
        expect(noExec.code).toBe(2);
        expect(existsSync(join(store, 'evidence'))).toBe(false); // nothing written for a non-executable

        const outside = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-nowhere-'));
        try {
            expect(capture(() => run(['add', 'feat', '--ac', 'AC-001', '--', 'true'], outside)).code).toBe(2);
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it('exit 2 when the store cannot resolve (SUSPEC_STATE_DIR pointing at a file)', () => {
        const asFile = join(root, 'state-as-file');
        writeFileSync(asFile, 'not a dir');
        process.env.SUSPEC_STATE_DIR = asFile;
        expect(capture(() => run(['add', 'feat', '--ac', 'AC-001', '--', 'true'], repo)).code).toBe(2);
    });
});
