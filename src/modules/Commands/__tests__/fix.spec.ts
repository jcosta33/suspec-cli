import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/fix.ts';

// SPEC-suspec-v2 AC-017: `suspec fix <FIND-id | #issue>` — a promoted source becomes a store
// fix-spec (base_sha = repo HEAD, affected_areas from the finding) and launches through the SAME
// work pipeline (stub runner). The wipe-survival property: rm -rf the store, `fix #123` still
// works end-to-end (stubbed gh re-supplies the content, resolution recreates the store).

let root: string;
let repo: string;
let stateRoot: string;
let store: string;
let ghState: string;
let savedStateDir: string | undefined;
let savedPath: string | undefined;
let savedGhState: string | undefined;

const git = (args: string[], cwd = repo): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

const FINDING = `---
type: finding
id: FIND-007
run: feat
severity: normal
affected_areas:
  - src/auth
---

# The token refresh races

Two refreshes in flight clobber each other.
`;

// The gh stub: answers `issue view 123 --json title,body,labels`; any other issue fails.
const GH_STUB = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = process.env.GH_STUB_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
if (args[0] === 'issue' && args[1] === 'view') {
    if (args[2] !== '123') { process.stderr.write('no such issue'); process.exit(1); }
    process.stdout.write(JSON.stringify({ title: 'Crash on save', body: 'It crashes when saving twice.', labels: [{ name: 'bug' }] }));
    process.exit(0);
}
process.exit(1);
`;

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
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-fix-')));
    repo = join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);

    stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'finding-007.md'), FINDING);

    // The stub runner + config — the SAME work pipeline launches the fix spec.
    const stub = join(root, 'stub-agent.sh');
    writeFileSync(stub, `#!/bin/sh\npwd -P > cwd.txt\nprintf '%s' "$1" > arg.txt\nexit 0\n`);
    chmodSync(stub, 0o755);
    writeFileSync(
        join(repo, 'suspec.config.json'),
        JSON.stringify({ runners: { default: 'stub', stub: { command_template: `${stub} {prompt}` } } })
    );
    writeFileSync(join(repo, 'seed.txt'), 'seed');
    git(['add', '.']);
    git(['commit', '-m', 'init']);

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

describe('suspec fix <FIND-id> — scaffold from the store (AC-017)', () => {
    it('--no-launch scaffolds spec-fix-<slug>.md (base_sha = HEAD, areas from the finding) and launches nothing', () => {
        const { code, out } = capture(() => run(['FIND-007', '--no-launch'], repo));
        expect(code).toBe(0);
        const specPath = join(store, 'spec-fix-find-007.md');
        expect(out).toContain(specPath);
        expect(out).toContain('suspec work SPEC-fix-find-007');
        const content = readFileSync(specPath, 'utf8');
        expect(content).toContain('id: SPEC-fix-find-007');
        expect(content).toContain(`base_sha: ${git(['rev-parse', 'HEAD']).trim()}`);
        expect(content).toContain('affected_areas:\n  - src/auth');
        expect(content).toContain('Two refreshes in flight clobber each other.');
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('resolves an ARCHIVED finding too', () => {
        mkdirSync(join(store, 'archive'), { recursive: true });
        renameSync(join(store, 'finding-007.md'), join(store, 'archive', 'finding-007.md'));
        const { code } = capture(() => run(['FIND-007', '--no-launch'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(store, 'spec-fix-find-007.md'))).toBe(true);
    });

    it('re-running reuses the existing fix spec instead of forking it', () => {
        expect(capture(() => run(['FIND-007', '--no-launch'], repo)).code).toBe(0);
        const before = readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8');
        const again = capture(() => run(['FIND-007', '--no-launch', '--json'], repo));
        expect(again.code).toBe(0);
        expect(JSON.parse(again.out)).toMatchObject({ created: false, spec: 'SPEC-fix-find-007' });
        expect(readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8')).toBe(before);
    });

    it('hands off to the WORK pipeline: worktree created, runner launched there, run file recorded', () => {
        const { code, err } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(0);
        expect(err).toContain('launching via the work pipeline');
        const worktree = join(repo, '.worktrees', 'fix-find-007');
        expect(readFileSync(join(worktree, 'cwd.txt'), 'utf8').trim()).toBe(worktree);
        expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktree).trim()).toBe('suspec/fix-find-007');
        const runFile = readFileSync(join(store, 'run-fix-find-007.md'), 'utf8');
        expect(runFile).toContain('spec: SPEC-fix-find-007');
        expect(runFile).toContain('status: exited');
    });

    it('forwards --runner / --base / --json to the work pipeline', () => {
        const { code, out } = capture(() => run(['FIND-007', '--runner', 'stub', '--base', 'main', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out) as { runner: string; branch: string; spec: string };
        expect(parsed.runner).toBe('stub');
        expect(parsed.spec).toBe('SPEC-fix-find-007');
    });

    it('an unknown finding exits 2 naming the store searched (archive included)', () => {
        const { code, err } = capture(() => run(['FIND-999', '--no-launch'], repo));
        expect(code).toBe(2);
        expect(err).toContain('no finding FIND-999');
        expect(err).toContain('including archive/');
    });
});

describe('suspec fix #issue — scaffold from GitHub (AC-017)', () => {
    it('#123 fetches title/body/labels via gh and scaffolds spec-fix-issue-123.md', () => {
        const { code } = capture(() => run(['#123', '--no-launch'], repo));
        expect(code).toBe(0);
        const content = readFileSync(join(store, 'spec-fix-issue-123.md'), 'utf8');
        expect(content).toContain('id: SPEC-fix-issue-123');
        // Quoted: ` #` after a space would open a YAML comment, so the emitter double-quotes it.
        expect(content).toContain('title: "Fix #123 — Crash on save"');
        expect(content).toContain('It crashes when saving twice.');
        expect(content).toContain('labels: bug');
        // gh was asked exactly for title,body,labels (the AC-017 fetch shape).
        expect(readFileSync(join(ghState, 'calls.log'), 'utf8')).toContain(
            '["issue","view","123","--json","title,body,labels"]'
        );
    });

    it('WIPE SURVIVAL: rm -rf the store, then `fix #123` works end-to-end into a fresh launch', () => {
        rmSync(store, { recursive: true, force: true });
        const { code } = capture(() => run(['#123'], repo));
        expect(code).toBe(0);
        // The store was recreated by resolution (dir + .repo-path marker) …
        expect(readFileSync(join(store, '.repo-path'), 'utf8').trim()).toBe(repo);
        // … the spec was re-scaffolded from the durable copy (the issue) …
        expect(existsSync(join(store, 'spec-fix-issue-123.md'))).toBe(true);
        // … and the launch ran to completion in the worktree with the run recorded.
        const worktree = join(repo, '.worktrees', 'fix-issue-123');
        expect(readFileSync(join(worktree, 'cwd.txt'), 'utf8').trim()).toBe(worktree);
        expect(readFileSync(join(store, 'run-fix-issue-123.md'), 'utf8')).toContain('status: exited');
    });

    it('a gh failure (unknown issue) exits 1 naming the gh dependency, writing nothing', () => {
        const { code, out } = capture(() => run(['#999', '--no-launch'], repo));
        expect(code).toBe(1);
        expect(out).toContain('fix #999 needs the gh CLI');
        expect(out).toContain('no such issue');
        expect(existsSync(join(store, 'spec-fix-issue-999.md'))).toBe(false);
    });

    it('usage errors exit 2: no ref, a malformed #ref, a path-shaped FIND ref', () => {
        expect(capture(() => run([], repo)).code).toBe(2);
        const malformed = capture(() => run(['#abc'], repo));
        expect(malformed.code).toBe(2);
        expect(malformed.err).toContain('#<number>');
        expect(capture(() => run(['../escape'], repo)).code).toBe(2);
    });
});
