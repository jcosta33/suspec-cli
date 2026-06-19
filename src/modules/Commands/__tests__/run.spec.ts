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
    statSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { execFileSync } from 'child_process';

// Repo-relative file paths under `dir`, skipping `.git` and `.worktrees` (the agent's space) — used to
// enumerate swarm's own write-set and assert it is exactly the run record (AC-002).
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

import { run } from '../useCases/run.ts';

// SPEC-swarm-cli-run. `swarm run <task> --agent <name>` launches a prepared task on an agent in its
// worktree and records the launch — verified end-to-end with a STUB adapter (a tiny shell script), so
// no real agent CLI / credentials are needed. The stub records where it ran (cwd.txt) and the
// instruction it received (arg.txt) into its working directory (the worktree), which doubles as proof
// the AGENT did the worktree writes, not swarm (AC-002).

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - ../../../swarm/docs/adrs/0077-swarm-cli-reconcile-only-harness.md
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.

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

- \`src\`
`;

let repo: string;
const git = (args: string[], cwd = repo): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

// Capture `run`'s stdout/stderr (it is synchronous — spawnSync under the hood). The launched stub
// inherits stdio but writes only files, so nothing pollutes the captured streams.
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

// Build a prepared task: a repo+workspace with specs/ + tasks/, a `.swarm/config.yaml` whose `stub`
// adapter points at a recording shell script, and (unless suppressed) the task's worktree.
function buildRun(
    opts: {
        withWorktree?: boolean;
        withConfig?: boolean;
        agentDefault?: string;
        instruction?: string;
        exit?: number;
        command?: string; // override the adapter command (e.g. a nonexistent binary)
        noSource?: boolean; // a task packet with no `source:` — exercises the worktree fallback
    } = {}
): { worktree: string; stub: string } {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(repo, 'tasks'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    const task = opts.noSource
        ? `---\ntype: task\nid: TASK-feat\nscope: [AC-001]\nstatus: ready\n---\n\n# Task\n\n## Affected areas\n\n- \`src\`\n`
        : TASK;
    writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), task);

    const stub = join(repo, 'stub-agent.sh');
    // Records its working directory + the instruction it was given, then exits with `exit`.
    writeFileSync(stub, `#!/bin/sh\npwd -P > cwd.txt\nprintf '%s' "$1" > arg.txt\nexit ${opts.exit ?? 0}\n`);
    chmodSync(stub, 0o755);

    if (opts.withConfig !== false) {
        mkdirSync(join(repo, '.swarm'), { recursive: true });
        writeFileSync(
            join(repo, '.swarm', 'config.yaml'),
            `agents:\n` +
                `  default: ${opts.agentDefault ?? 'stub'}\n` +
                `  available: [stub]\n` +
                `  stub:\n` +
                `    command: ${opts.command ?? stub}\n` +
                `    working_directory: task_worktree\n` +
                `    startup_instruction: "${opts.instruction ?? 'RUN-THE-TASK'}"\n`
        );
    }

    git(['add', '.']);
    git(['commit', '-m', 'init']);

    let worktree = join(repo, '.worktrees', 'feat-feat');
    if (opts.withWorktree !== false) {
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        git(['worktree', 'add', '-b', 'swarm/feat/feat', worktree, base]);
    } else {
        worktree = '';
    }
    return { worktree, stub };
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-run-')));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('swarm run — launch (AC-001/002/004)', () => {
    it('launches the named adapter in the task worktree, delivering the startup instruction (AC-001)', () => {
        const { worktree } = buildRun({ instruction: 'GO-NOW' });
        const { code } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        // The stub ran in the worktree (its recorded cwd) and got the instruction as its first arg.
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
        expect(readFileSync(join(worktree, 'cwd.txt'), 'utf8').trim()).toBe(worktree);
        expect(readFileSync(join(worktree, 'arg.txt'), 'utf8')).toBe('GO-NOW');
    });

    it('writes no code of its own — the worktree writes are the agent stub`s; swarm`s only write is the run record (AC-002)', () => {
        const { worktree } = buildRun();
        const before = filesUnder(repo);
        capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        // The files in the worktree were created by the stub (its cwd), not by swarm.
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
        // Enumerate swarm's full write-set under the repo (the worktree — the agent's space — excluded):
        // the ONLY new path is the run record. No spec/review/status/source file is authored by swarm.
        const added = filesUnder(repo).filter((p) => !before.includes(p));
        expect(added).toEqual([join('.swarm', 'work', 'feat.json')]);
    });

    it('launches with no argument when the adapter`s startup_instruction is empty (AC-001)', () => {
        const { worktree } = buildRun({ instruction: '' });
        const { code } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        // Still launched in the worktree, but the stub received no first arg → it recorded an empty one.
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
        expect(readFileSync(join(worktree, 'arg.txt'), 'utf8')).toBe('');
    });

    it('records the launch envelope under .swarm/work/<task>.json (AC-004)', () => {
        const { worktree } = buildRun();
        capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        const recordPath = join(repo, '.swarm', 'work', 'feat.json');
        expect(existsSync(recordPath)).toBe(true);
        const record = JSON.parse(readFileSync(recordPath, 'utf8'));
        expect(record).toMatchObject({
            task_id: 'TASK-feat',
            adapter: 'stub',
            worktree,
            branch: 'swarm/feat/feat',
            source: 'SPEC-feat',
            exit: 0,
        });
        // The delegation-provenance block (ADR-0088 producer 1): a record of what was launched, and
        // verdict-free — no result/verdict/pass field rides along (ADR-0077 D8 / PG-001).
        expect(record.provenance).toEqual({
            worker: 'stub',
            reason: 'TASK-feat',
            isolation: 'worktree',
            could_edit: true,
            exit: 0,
        });
        // changed_files (ADR-0088 producer 1): the worktree diff after exit — the stub's two untracked
        // writes (cwd.txt + arg.txt), captured via the review differ against the repo's current branch.
        expect(record.changed_files).toEqual(['arg.txt', 'cwd.txt']);
        for (const key of ['result', 'verdict', 'status', 'decision']) {
            expect(Object.keys(record)).not.toContain(key);
            expect(Object.keys(record.provenance)).not.toContain(key);
        }
    });
});

describe('swarm run — adapter resolution (AC-005)', () => {
    it('uses agents.default when --agent is omitted', () => {
        const { worktree } = buildRun({ agentDefault: 'stub' });
        const { code } = capture(() => run(['TASK-feat'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
    });

    it('an unknown agent exits 2, launching nothing and writing no run record', () => {
        const { worktree } = buildRun();
        const { code, err } = capture(() => run(['TASK-feat', '--agent', 'nope'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/unknown agent "nope"/);
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(false); // never launched
        expect(existsSync(join(repo, '.swarm', 'work', 'feat.json'))).toBe(false);
    });

    it('a missing .swarm/config.yaml exits 2, launching nothing', () => {
        const { worktree } = buildRun({ withConfig: false });
        const { code, err } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/no \.swarm\/config\.yaml/);
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(false);
    });

    it('an unreadable .swarm/config.yaml exits 2 cleanly, launching nothing (AC-005)', () => {
        // config.yaml as a directory → readFileSync throws EISDIR; resolve_launch must turn it into a
        // usage error (exit 2) from within the command, not let it escape as an unhandled throw.
        buildRun({ withConfig: false });
        mkdirSync(join(repo, '.swarm', 'config.yaml'), { recursive: true });
        const { code, err } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/cannot read \.swarm\/config\.yaml/);
        expect(existsSync(join(repo, '.swarm', 'work', 'feat.json'))).toBe(false);
    });

    it('a configured command that cannot be launched exits 2 (the binary does not exist)', () => {
        buildRun({ command: '/nonexistent/swarm-agent-xyz' });
        const { code, err } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/could not launch agent/);
        expect(existsSync(join(repo, '.swarm', 'work', 'feat.json'))).toBe(false); // nothing recorded on a launch failure
    });

    it('resolves the worktree by the lone-match fallback when the task names no source spec', () => {
        // No `source:` in the packet → the source-spec lookup yields nothing, so resolution falls back
        // to the single swarm worktree whose branch tail matches the task slug.
        const { worktree } = buildRun({ noSource: true });
        const { code } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(worktree, 'cwd.txt'))).toBe(true);
        const record = JSON.parse(readFileSync(join(repo, '.swarm', 'work', 'feat.json'), 'utf8'));
        expect(record.source).toBeNull();
    });
});

describe('swarm run — guards (AC-006/007/008)', () => {
    it('a task with no worktree exits 2, directing to swarm worktree create, launching nothing (AC-006)', () => {
        buildRun({ withWorktree: false });
        const { code, err } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/no worktree for TASK-feat.*swarm worktree create/s);
        expect(existsSync(join(repo, '.swarm', 'work', 'feat.json'))).toBe(false);
    });

    it('reports the launch verdict-free — no result/verdict/decision/pass field (AC-007)', () => {
        buildRun();
        const { out, code } = capture(() => run(['TASK-feat', '--agent', 'stub', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.adapter).toBe('stub');
        expect(typeof parsed.exit).toBe('number');
        for (const key of ['result', 'verdict', 'decision', 'suggestedDecision', 'mergeDecision']) {
            expect(Object.keys(parsed)).not.toContain(key);
        }
        expect(out).not.toMatch(/"status"\s*:\s*"pass"/);
    });

    it('exits 2 with no task, outside a repo, and on an unresolvable task (AC-008)', () => {
        // no task arg
        expect(capture(() => run([], repo)).code).toBe(2);
        // outside a git repo
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect(capture(() => run(['TASK-feat', '--agent', 'stub'], notRepo)).code).toBe(2);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
        // a repo+config but no tasks/<task>.md
        buildRun();
        expect(capture(() => run(['TASK-missing', '--agent', 'stub'], repo)).code).toBe(2);
    });
});

describe('swarm run — the board boundary (AC-003)', () => {
    it('leaves a pre-existing status.md (the board) byte-unchanged — reconcile-only', () => {
        // swarm run is the launcher; prove it never touches the hand-owned board even when one is
        // present (the static no-board-write scan in Core/noBoardWrite.spec covers all four layers; this
        // is the runtime backstop for `run`).
        buildRun();
        const board = '# Board\n\n| spec | task | review |\n| --- | --- | --- |\n| SPEC-feat | TASK-feat | — |\n';
        const boardPath = join(repo, 'status.md');
        writeFileSync(boardPath, board);
        const mtimeBefore = statSync(boardPath).mtimeMs;

        const { code } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        // The run record landed under .swarm/work/, but the board is byte-identical AND untouched.
        expect(existsSync(join(repo, '.swarm', 'work', 'feat.json'))).toBe(true);
        expect(readFileSync(boardPath, 'utf8')).toBe(board);
        expect(statSync(boardPath).mtimeMs).toBe(mtimeBefore);
    });
});

describe('swarm run — agent exit surfacing', () => {
    it('a non-zero agent exit is recorded and surfaced as a warning (exit 1), not swarm`s own failure', () => {
        buildRun({ exit: 3 });
        const { code } = capture(() => run(['TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(1); // warning level, not 2 (swarm launched + recorded fine)
        const record = JSON.parse(readFileSync(join(repo, '.swarm', 'work', 'feat.json'), 'utf8'));
        expect(record.exit).toBe(3);
    });
});
