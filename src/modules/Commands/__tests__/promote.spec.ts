import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/promote.ts';

// SPEC-suspec-v2 AC-016: `suspec promote <FIND>` — the gh issue is created from the finding
// (title, body, evidence digest, provenance label), the issue number lands back in the finding's
// frontmatter, and the finding archives. AC-025: gh missing/failing errors exit 1 NAMING gh;
// nothing changes. Stubbed gh on PATH throughout (the done.spec pattern).

let root: string;
let repo: string;
let store: string;
let ghState: string;
let stubDir: string;
let savedStateDir: string | undefined;
let savedPath: string | undefined;
let savedGhState: string | undefined;

const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const FINDING = `---
type: finding
id: FIND-007
run: feat
severity: normal
---

# The token refresh races

Two refreshes in flight clobber each other.
`;

// The gh stub: answers `issue create` with a fixed URL (or fails on the issue-fail marker) and
// logs every call's args for payload assertions.
const GH_STUB = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dir = process.env.GH_STUB_STATE;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, 'calls.log'), JSON.stringify(args) + '\\n');
if (args[0] === 'issue' && args[1] === 'create') {
    if (fs.existsSync(path.join(dir, 'issue-fail'))) { process.stderr.write('issue create refused'); process.exit(1); }
    process.stdout.write('https://github.com/o/r/issues/55\\n');
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

// The last `gh issue create` call's args, parsed from the stub's log.
function last_issue_create(): string[] {
    const lines = readFileSync(join(ghState, 'calls.log'), 'utf8').trim().split('\n');
    const creates = lines.map((line) => JSON.parse(line) as string[]).filter((a) => a[0] === 'issue');
    return creates[creates.length - 1];
}

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-promote-'));
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
    writeFileSync(join(store, 'finding-007.md'), FINDING);

    ghState = join(root, 'gh-state');
    mkdirSync(ghState, { recursive: true });
    stubDir = join(root, 'stub-bin');
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

describe('suspec promote <FIND> — the issue payload (AC-016)', () => {
    it('creates the issue with the finding title; the body carries the finding + evidence digest + provenance label', () => {
        // One evidence record on the finding's run — the digest must reference it (refs, not raw output).
        mkdirSync(join(store, 'evidence', 'feat'), { recursive: true });
        writeFileSync(
            join(store, 'evidence', 'feat', '001-pnpm-test.md'),
            '---\ntype: evidence\nrun: feat\nac: AC-001\ncommand: pnpm test\nexit: 0\nprovenance: cli-verified\n---\n'
        );
        const { code, out } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(0);
        expect(out).toContain('promoted finding-007.md → https://github.com/o/r/issues/55');

        const args = last_issue_create();
        expect(args[args.indexOf('--title') + 1]).toBe('The token refresh races');
        const body = args[args.indexOf('--body') + 1];
        expect(body).toContain('Two refreshes in flight clobber each other.');
        expect(body).toContain('## Evidence digest');
        expect(body).toContain('- AC-001: `pnpm test` → exit 0 (cli-verified)');
        expect(body).toContain('Provenance: suspec finding FIND-007 · run feat');
    });

    it('records the issue ref + promoted status in the ARCHIVED finding frontmatter (root copy gone)', () => {
        const { code } = capture(() => run(['finding-007.md'], repo)); // filename resolves too
        expect(code).toBe(0);
        expect(existsSync(join(store, 'finding-007.md'))).toBe(false);
        const archived = readFileSync(join(store, 'archive', 'finding-007.md'), 'utf8');
        expect(archived).toContain('issue: #55');
        expect(archived).toContain('status: promoted');
        expect(archived).toContain('Two refreshes in flight clobber each other.'); // body preserved
        // The issue-body footer never lands in the archived artifact.
        expect(archived).not.toContain('## Evidence digest');
    });

    it('a run with no evidence still promotes, with an honest empty digest', () => {
        const { code } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(0);
        expect(last_issue_create().join(' ')).toContain('no evidence records for this run');
    });

    it('a degenerate evidence record digests with honest unknowns, never a crash', () => {
        mkdirSync(join(store, 'evidence', 'feat'), { recursive: true });
        writeFileSync(join(store, 'evidence', 'feat', '001-bare.md'), '---\ntype: evidence\n---\n');
        const { code } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(0);
        expect(last_issue_create().join(' ')).toContain(
            'unmapped: `unknown command` → exit ? (unknown provenance)'
        );
    });

    it('a finding with no id/run labels provenance by filename with an unknown run', () => {
        writeFileSync(join(store, 'finding-anon.md'), '---\ntype: finding\n---\n\n# Anonymous\n\nbody\n');
        const { code } = capture(() => run(['finding-anon.md'], repo));
        expect(code).toBe(0);
        const body = last_issue_create().join(' ');
        expect(body).toContain('Provenance: suspec finding finding-anon.md · run unknown');
    });

    it('--json emits the machine shape', () => {
        const { code, out } = capture(() => run(['FIND-007', '--json'], repo));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({
            level: 'clean',
            finding: 'finding-007.md',
            issue_url: 'https://github.com/o/r/issues/55',
        });
    });
});

describe('suspec promote — refusals', () => {
    it('an unknown finding exits 2 naming the ref and the store searched; an archived one is not open', () => {
        const missing = capture(() => run(['FIND-999'], repo));
        expect(missing.code).toBe(2);
        expect(missing.err).toContain('no open finding FIND-999');
        expect(missing.err).toContain(store);

        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'finding-042.md'), FINDING.replace('FIND-007', 'FIND-042'));
        expect(capture(() => run(['FIND-042'], repo)).code).toBe(2);
    });

    it('no store yet → exit 2, and the probe creates no store dir', () => {
        rmSync(store, { recursive: true, force: true });
        const { code, err } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(2);
        expect(err).toContain('no finding FIND-007: this repo has no store yet');
        expect(existsSync(store)).toBe(false);
    });

    it('missing/path-shaped ref and outside-a-repo are usage errors (exit 2)', () => {
        expect(capture(() => run([], repo)).code).toBe(2);
        expect(capture(() => run(['../escape'], repo)).err).toContain('never a path');
        const bare = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-nogit-'));
        try {
            expect(capture(() => run(['FIND-007'], bare)).code).toBe(2);
        } finally {
            rmSync(bare, { recursive: true, force: true });
        }
    });
});

describe('suspec promote — the gh dependency (AC-025)', () => {
    it('a FAILING gh exits 1 naming gh; the finding stays open, byte-untouched', () => {
        writeFileSync(join(ghState, 'issue-fail'), '');
        const before = readFileSync(join(store, 'finding-007.md'), 'utf8');
        const { code, out } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(1);
        expect(out).toContain('promotion needs the gh CLI');
        expect(out).toContain('issue create refused');
        expect(readFileSync(join(store, 'finding-007.md'), 'utf8')).toBe(before);
        expect(existsSync(join(store, 'archive', 'finding-007.md'))).toBe(false);
    });

    it('a MISSING gh exits 1 with the dependency named — `promote` without gh on PATH', () => {
        // A bin dir holding ONLY git (symlinked) — gh is genuinely absent from PATH.
        const gitOnly = join(root, 'git-only-bin');
        mkdirSync(gitOnly);
        const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
        symlinkSync(realGit, join(gitOnly, 'git'));
        process.env.PATH = gitOnly;

        const { code, out } = capture(() => run(['FIND-007'], repo));
        expect(code).toBe(1);
        expect(out).toContain('gh is not installed or not in PATH');
        expect(existsSync(join(store, 'finding-007.md'))).toBe(true);
    });

    it('the gh-failure shape under --json still exits 1 with machine output', () => {
        writeFileSync(join(ghState, 'issue-fail'), '');
        const { code, out } = capture(() => run(['FIND-007', '--json'], repo));
        expect(code).toBe(1);
        expect(JSON.parse(out)).toMatchObject({ level: 'warning', refused: 'gh', finding: 'finding-007.md' });
    });
});
