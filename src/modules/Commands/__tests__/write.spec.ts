import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/write.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';

// SPEC-suspec-v2 AC-023: `suspec write spec "<intent>"` — scaffold a draft STORE spec (valid
// frontmatter incl. base_sha = repo HEAD, one empty AC, lint-clean) and, under --launch, dispatch
// the spec-author prompt to the runner in the current dir. The CLI authors NO requirement content.

let root: string;
let repo: string;
let stateRoot: string;
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

function buildRepo(withStubRunner = false): { stub: string } {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    const stub = join(root, 'stub-runner.sh');
    writeFileSync(stub, `#!/bin/sh\npwd -P > author-cwd.txt\nprintf '%s' "$1" > author-arg.txt\nexit 0\n`);
    chmodSync(stub, 0o755);
    if (withStubRunner) {
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ runners: { default: 'stub', stub: { command_template: `${stub} {prompt}` } } })
        );
    }
    writeFileSync(join(repo, 'seed.txt'), 'seed\n');
    git(['add', '.']);
    git(['commit', '-m', 'init']);
    return { stub };
}

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-write-')));
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

describe('suspec write spec (AC-023)', () => {
    it('scaffolds spec-<slug>.md in the STORE: draft, base_sha = repo HEAD, one empty AC — and lints clean', () => {
        buildRepo();
        const head = git(['rev-parse', 'HEAD']).trim();
        const result = capture(() => run(['spec', 'Tighten the token parser'], repo));
        expect(result.code).toBe(0);
        expect(result.out).toContain('scaffolded SPEC-tighten-the-token-parser');

        const path = join(store, 'spec-tighten-the-token-parser.md');
        const content = readFileSync(path, 'utf8');
        expect(content).toContain('type: spec');
        expect(content).toContain('id: SPEC-tighten-the-token-parser');
        expect(content).toContain('status: draft');
        expect(content).toContain(`base_sha: ${head}`);
        expect(content).toContain('grammar_version:');
        expect(content).toContain('Tighten the token parser');

        // parses as a real spec with ONE skeleton AC — no authored requirement content (the
        // lint-clean assertion against the checks engine lives in scaffoldStoreSpec.spec.ts)
        const parsed = parse_spec_record({ source: content, path });
        expect(isOk(parsed)).toBe(true);
        if (isOk(parsed)) {
            expect(parsed.value.requirements.map((r) => r.id)).toEqual(['AC-001']);
        }
    });

    it('REUSES a namesake byte-untouched and says so', () => {
        buildRepo();
        capture(() => run(['spec', 'Tighten the token parser'], repo));
        const path = join(store, 'spec-tighten-the-token-parser.md');
        const before = readFileSync(path, 'utf8');
        const again = capture(() => run(['spec', 'Tighten   the token PARSER'], repo)); // same slug
        expect(again.code).toBe(0);
        expect(again.out).toContain('reusing');
        expect(readFileSync(path, 'utf8')).toBe(before);
    });

    it('--launch dispatches the spec-author prompt (a POINTER at the store spec) to the runner in the CURRENT dir', () => {
        buildRepo(true);
        const result = capture(() => run(['spec', 'Tighten the token parser', '--launch'], repo));
        expect(result.code).toBe(0);
        const arg = readFileSync(join(repo, 'author-arg.txt'), 'utf8');
        expect(arg).toContain('SPEC-tighten-the-token-parser');
        expect(arg).toContain(join(store, 'spec-tighten-the-token-parser.md'));
        expect(arg).toContain('Stated intent: Tighten the token parser');
        expect(arg).toContain('acceptance criteria');
        expect(arg).toContain('status: draft'); // instructs to leave draft — a human promotes
        expect(readFileSync(join(repo, 'author-cwd.txt'), 'utf8').trim()).toBe(repo); // no worktree
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('without --launch nothing is dispatched', () => {
        buildRepo(true);
        capture(() => run(['spec', 'Quiet scaffold'], repo));
        expect(existsSync(join(repo, 'author-arg.txt'))).toBe(false);
    });

    it('a non-zero author exit is a soft signal (exit 1), reported as data', () => {
        buildRepo();
        const stub = join(root, 'failing-runner.sh');
        writeFileSync(stub, '#!/bin/sh\nexit 4\n');
        chmodSync(stub, 0o755);
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ runners: { default: 'stub', stub: { command_template: `${stub} {prompt}` } } })
        );
        const result = capture(() => run(['spec', 'Soft failure', '--launch', '--json'], repo));
        expect(result.code).toBe(1);
        expect(JSON.parse(result.out)).toMatchObject({ level: 'warning', exit: 4, launched: true });
    });

    it('usage errors exit 2: no type, an unknown type, a missing/empty/underivable intent, an unknown runner', () => {
        buildRepo(true);
        expect(capture(() => run([], repo)).code).toBe(2);
        const unknown = capture(() => run(['novel', 'x'], repo));
        expect(unknown.code).toBe(2);
        expect(unknown.err).toContain('unknown write type');
        expect(capture(() => run(['spec'], repo)).code).toBe(2);
        expect(capture(() => run(['spec', '   '], repo)).code).toBe(2);
        expect(capture(() => run(['spec', '¡¡¡'], repo)).code).toBe(2); // no slug derivable
        expect(capture(() => run(['spec', 'x', '--launch', '--runner', 'ghost'], repo)).code).toBe(2);
    });

    it('reusing a namesake under --launch still dispatches, and says "reusing"', () => {
        buildRepo(true);
        capture(() => run(['spec', 'Twice launched'], repo));
        const again = capture(() => run(['spec', 'Twice launched', '--launch'], repo));
        expect(again.code).toBe(0);
        expect(again.out).toContain('reusing SPEC-twice-launched');
        expect(existsSync(join(repo, 'author-arg.txt'))).toBe(true);
    });

    it('exit 2 when the store cannot resolve (SUSPEC_STATE_DIR pointing at a file)', () => {
        buildRepo();
        const asFile = join(root, 'state-as-file');
        writeFileSync(asFile, 'not a dir');
        process.env.SUSPEC_STATE_DIR = asFile;
        expect(capture(() => run(['spec', 'x'], repo)).code).toBe(2);
    });

    it('exit 2 when the scaffold cannot be written (read-only store)', () => {
        buildRepo();
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        chmodSync(store, 0o555);
        try {
            expect(capture(() => run(['spec', 'blocked write'], repo)).code).toBe(2);
        } finally {
            chmodSync(store, 0o755);
        }
    });

    it('exit 2 when the author program cannot LAUNCH (missing binary in the template)', () => {
        buildRepo();
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({
                runners: { default: 'stub', stub: { command_template: 'suspec-no-such-runner-xyz {prompt}' } },
            })
        );
        expect(capture(() => run(['spec', 'x', '--launch'], repo)).code).toBe(2);
    });

    it('runner resolution degrades safely: no config file and a MALFORMED config both leave only the built-ins', () => {
        buildRepo(); // no suspec.config.json at all
        const noConfig = capture(() => run(['spec', 'a b', '--launch', '--runner', 'ghost'], repo));
        expect(noConfig.code).toBe(2);
        expect(noConfig.err).toContain('unknown runner "ghost"');
        writeFileSync(join(repo, 'suspec.config.json'), '{broken json');
        const malformed = capture(() => run(['spec', 'c d', '--launch', '--runner', 'ghost'], repo));
        expect(malformed.code).toBe(2);
        expect(malformed.err).toContain('unknown runner "ghost"');
    });

    it('outside a git repo exits 2', () => {
        const outside = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-write-nowhere-'));
        try {
            expect(capture(() => run(['spec', 'x'], outside)).code).toBe(2);
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });
});
