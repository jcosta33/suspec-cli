import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/show.ts';

// `suspec show <kind> [ref] [--json]` — the read-only loader command, re-aimed at the STORE
// (ADR-0137). Mirrors new.spec: a repo + a store rooted via SUSPEC_STATE_DIR, drive run(),
// assert the projected JSON + the exit posture (0 clean · 2 error). The store is PROBED —
// a show never creates it.

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - self
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a-test

## Non-goals

- none.

## Open questions

- none.
`;
const TASK = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001]
status: ready
---

# Task

## Affected areas

- \`src/feat\`
`;
const RUN_FILE = `---
type: run
spec: SPEC-feat
status: exited
---

# Run — SPEC-feat

agent notes
`;

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-show-cmd-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'spec-feat.md'), SPEC);
    writeFileSync(join(store, 'task-feat.md'), TASK);
    writeFileSync(join(store, 'run-feat.md'), RUN_FILE);
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

function capture(fn: () => number): { out: string; code: number } {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        const code = fn();
        return { out: out.join(''), code };
    } finally {
        spy.mockRestore();
    }
}

describe('suspec show command — store-rooted (ADR-0137)', () => {
    it('checks --json → exit 0, emits {kind:checks} with version + checks', () => {
        const { out, code } = capture(() => run(['checks', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.kind).toBe('checks');
        expect(parsed.value.checks.length).toBeGreaterThan(0);
    });

    it('task <slug> --json → exit 0, emits the packet parsed from the STORE task-<slug>.md', () => {
        const { out, code } = capture(() => run(['task', 'feat', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.kind).toBe('task');
        expect(parsed.value.id).toBe('TASK-feat');
        expect(parsed.value.scope).toEqual(['AC-001']);
    });

    it('spec by id --json → exit 0 — resolved from the store, no repo specs/ tree involved', () => {
        const { out, code } = capture(() => run(['spec', 'SPEC-feat', '--json'], repo));
        expect(code).toBe(0);
        expect(JSON.parse(out).value.frontmatter.id).toBe('SPEC-feat');
    });

    it('run <slug> --json → exit 0, the run record projection', () => {
        const { out, code } = capture(() => run(['run', 'feat', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.kind).toBe('run');
        expect(parsed.value.frontmatter.spec).toBe('SPEC-feat');
        expect(parsed.value.body).toContain('agent notes');
    });

    it('show <repo-file-path> still works — the path face reads the repo, not the store', () => {
        writeFileSync(join(repo, 'promoted.md'), SPEC);
        const { out, code } = capture(() => run(['promoted.md', '--json'], repo));
        expect(code).toBe(0);
        expect(JSON.parse(out).kind).toBe('spec');
    });

    it('a missing artifact → exit 2 (the error posture)', () => {
        const { code } = capture(() => run(['task', 'does-not-exist', '--json'], repo));
        expect(code).toBe(2);
    });

    it('an unknown kind → exit 2', () => {
        const { code } = capture(() => run(['bogus', '--json'], repo));
        expect(code).toBe(2);
    });

    it('a repo with no store: store kinds exit 2 and the store is NOT created (probe-only)', () => {
        const bare = join(root, 'bare');
        mkdirSync(bare, { recursive: true });
        const { code } = capture(() => run(['spec', 'SPEC-feat', '--json'], bare));
        expect(code).toBe(2);
        // Probe-only: no `<state-root>/bare/` dir appeared as a side effect of a read.
        expect(() => realpathSync(join(root, 'state', 'bare'))).toThrow();
    });

    it('non-json mode renders the parsed value as readable JSON', () => {
        const { out, code } = capture(() => run(['task', 'feat'], repo));
        expect(code).toBe(0);
        expect(out).toContain('TASK-feat'); // pretty-printed value
    });

    it('no args → exit 2 (empty kind is unknown)', () => {
        expect(capture(() => run([], repo)).code).toBe(2);
    });

    it('inside a git repo, the store keys off the REPO ROOT — show works from a subdirectory', () => {
        execFileSync('git', ['init'], { cwd: repo });
        const sub = join(repo, 'src');
        mkdirSync(sub, { recursive: true });
        const { code } = capture(() => run(['spec', 'SPEC-feat', '--json'], sub));
        expect(code).toBe(0);
    });
});
