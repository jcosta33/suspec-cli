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
import { join, relative } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/work.ts';
import { COMMAND_CATALOG } from '../useCases/catalog.ts';

// SPEC-suspec-cli-work. `suspec work <SPEC>` works a spec directly (task optional): resolve → create/reuse
// worktree → setup → lean prompt → launch → record. Verified end-to-end with a STUB adapter (a shell
// script that records where it ran, cwd.txt, and the prompt it received, arg.txt), so no real agent CLI
// or credentials are needed. Mirrors run.spec.ts's harness, adapted for the spec-first, worktree-creating
// pipeline.

// Repo-relative file paths under `dir`, skipping `.git` and `.worktrees` (the agent's space) — used to
// enumerate suspec's own write-set (AC-004/008).
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

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - ../../../suspec/docs/adrs/0136-launcher-boundary-automate-not-agent.md
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

// Build a workspace+repo with specs/ (+ optionally tasks/), a `.suspec/config.yaml` stub adapter, and
// optionally a `suspec.config.json` with a `setup` list. Unlike run.spec, it does NOT create a worktree —
// `suspec work` creates it.
function buildWork(
    opts: {
        withConfig?: boolean;
        withTask?: boolean;
        agentDefault?: string;
        exit?: number;
        command?: string;
        setup?: string[];
    } = {}
): { stub: string } {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    if (opts.withTask === true) {
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), TASK);
    }

    const stub = join(repo, 'stub-agent.sh');
    writeFileSync(stub, `#!/bin/sh\npwd -P > cwd.txt\nprintf '%s' "$1" > arg.txt\nexit ${opts.exit ?? 0}\n`);
    chmodSync(stub, 0o755);

    if (opts.withConfig !== false) {
        mkdirSync(join(repo, '.suspec'), { recursive: true });
        writeFileSync(
            join(repo, '.suspec', 'config.yaml'),
            `agents:\n` +
                `  default: ${opts.agentDefault ?? 'stub'}\n` +
                `  available: [stub]\n` +
                `  stub:\n` +
                `    command: ${opts.command ?? stub}\n` +
                `    working_directory: task_worktree\n` +
                `    startup_instruction: "IGNORED-work-generates-its-own"\n`
        );
    }
    if (opts.setup !== undefined) {
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ setup: opts.setup }));
    }

    git(['add', '.']);
    git(['commit', '-m', 'init']);
    return { stub };
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-work-')));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('suspec work — spec-first launch (AC-001/002/005)', () => {
    it('resolves a spec with no task, creates its worktree, and launches the adapter there', () => {
        buildWork();
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        const worktree = join(repo, '.worktrees', 'feat');
        expect(existsSync(worktree)).toBe(true);
        expect(readFileSync(join(worktree, 'cwd.txt'), 'utf8').trim()).toBe(worktree);
        expect(git(['rev-parse', '--abbrev-ref', 'HEAD'], worktree).trim()).toBe('suspec/feat');
    });

    it('accepts a spec dir slug as well as the frontmatter id', () => {
        buildWork();
        const { code } = capture(() => run(['feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('creates the worktree once, reusing it on a second run (AC-002)', () => {
        buildWork();
        expect(capture(() => run(['SPEC-feat', '--agent', 'stub'], repo)).code).toBe(0);
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        // Still exactly one worktree dir for the spec — the second run reused it, did not duplicate/fail.
        expect(readdirSync(join(repo, '.worktrees'))).toEqual(['feat']);
    });

    it('uses agents.default when --agent is omitted', () => {
        buildWork({ agentDefault: 'stub' });
        const { code } = capture(() => run(['SPEC-feat'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('honors an explicit --base for the new worktree', () => {
        buildWork();
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub', '--base', 'HEAD'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('warns when reusing a worktree that has uncommitted changes', () => {
        buildWork();
        capture(() => run(['SPEC-feat', '--agent', 'stub'], repo)); // creates the worktree; the stub dirties it
        const { code, err } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo)); // reuse — now dirty
        expect(code).toBe(0);
        expect(err).toMatch(/reusing a worktree with uncommitted changes/);
    });

    it('a --task that names no packet exits 2, creating nothing', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-feat', '--task', 'NOPE', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/no matching tasks\//);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
    });

    it('a configured command that cannot be launched exits 2, recording nothing', () => {
        buildWork({ command: '/nonexistent/suspec-agent-xyz' });
        const { code, err } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(2);
        expect(err).toMatch(/could not launch agent/);
        expect(existsSync(join(repo, '.suspec', 'work', 'spec-feat.json'))).toBe(false);
    });

    it('a create-worktree failure (a bad --base ref) exits 2', () => {
        buildWork();
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub', '--base', 'no-such-ref-xyz'], repo));
        expect(code).toBe(2);
    });
});

describe('suspec work — the generated prompt (AC-004)', () => {
    it('delivers a lean pointer prompt (names the spec + path, inlines no spec body) and persists it to scratch', () => {
        buildWork();
        capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        const delivered = readFileSync(join(repo, '.worktrees', 'feat', 'arg.txt'), 'utf8');
        expect(delivered).toMatch(/Suspec spec SPEC-feat/);
        expect(delivered).toMatch(/the spec at .*specs\/feat\/spec\.md/);
        // Lean pointer: the spec BODY is never inlined into the prompt.
        expect(delivered).not.toContain('The tool must do it');
        // The prompt is persisted as transient scratch under .suspec/work/, referenced by the run record.
        const promptScratch = join(repo, '.suspec', 'work', 'spec-feat.prompt.md');
        expect(existsSync(promptScratch)).toBe(true);
        expect(readFileSync(promptScratch, 'utf8')).toContain('Suspec spec SPEC-feat');
    });

    it('records the prompt provenance (path + sha256) in the run record', () => {
        buildWork();
        capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        const record = JSON.parse(readFileSync(join(repo, '.suspec', 'work', 'spec-feat.json'), 'utf8'));
        expect(record.prompt.path).toBe(join(repo, '.suspec', 'work', 'spec-feat.prompt.md'));
        expect(record.prompt.sha256).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('suspec work — the run record, re-anchored on the spec (AC-006)', () => {
    it('records the launch envelope keyed on the spec, driving_artifact: spec, verdict-free', () => {
        buildWork();
        capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        const record = JSON.parse(readFileSync(join(repo, '.suspec', 'work', 'spec-feat.json'), 'utf8'));
        expect(record).toMatchObject({
            task_id: 'SPEC-feat',
            adapter: 'stub',
            branch: 'suspec/feat',
            source: 'SPEC-feat',
            driving_artifact: 'spec',
            exit: 0,
        });
        expect(record.worktree).toBe(join(repo, '.worktrees', 'feat'));
        expect(record.provenance).toMatchObject({ worker: 'stub', reason: 'SPEC-feat', isolation: 'worktree', could_edit: true, exit: 0 });
        for (const key of ['result', 'verdict', 'status', 'decision']) {
            expect(Object.keys(record)).not.toContain(key);
        }
    });

    it('a --task narrows to the task packet and records driving_artifact: task', () => {
        buildWork({ withTask: true });
        const { code } = capture(() => run(['SPEC-feat', '--task', 'TASK-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        // The task worktree tail: suspec/feat/feat.
        const worktree = join(repo, '.worktrees', 'feat~feat');
        expect(existsSync(worktree)).toBe(true);
        const record = JSON.parse(readFileSync(join(repo, '.suspec', 'work', 'feat.json'), 'utf8'));
        expect(record.driving_artifact).toBe('task');
        expect(record.task_id).toBe('TASK-feat');
        // The prompt points at the task packet too.
        expect(readFileSync(join(worktree, 'arg.txt'), 'utf8')).toMatch(/task packet TASK-feat/);
    });
});

describe('suspec work — setup executor (AC-003)', () => {
    it('runs project-declared setup in the worktree before launch', () => {
        const setup = join(repo, 'setup-stub.sh');
        buildWork({ setup: [setup] });
        // The setup stub drops a sentinel into its cwd (the worktree), proving setup ran there.
        writeFileSync(setup, `#!/bin/sh\nprintf 'ok' > setup-ran.txt\n`);
        chmodSync(setup, 0o755);
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'setup-ran.txt'))).toBe(true);
    });

    it('a failed setup command warns and the launch still proceeds (advisory, not a gate)', () => {
        const setup = join(repo, 'setup-fail.sh');
        buildWork({ setup: [setup] });
        writeFileSync(setup, `#!/bin/sh\nexit 2\n`);
        chmodSync(setup, 0o755);
        const { code, err } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0); // the agent still launched + exited 0
        expect(err).toMatch(/setup command failed \(exit 2\)/);
        expect(existsSync(join(repo, '.worktrees', 'feat', 'cwd.txt'))).toBe(true);
    });

    it('no setup config prints a note and launches anyway', () => {
        buildWork();
        const { code, err } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0);
        expect(err).toMatch(/no setup commands/);
    });
});

describe('suspec work — --dry-run previews without mutating (AC-008)', () => {
    it('prints the plan + prompt and writes/creates/launches nothing', () => {
        buildWork({ setup: ['echo hi'] });
        const before = filesUnder(repo);
        const { out, code } = capture(() => run(['SPEC-feat', '--agent', 'stub', '--dry-run'], repo));
        expect(code).toBe(0);
        expect(out).toMatch(/dry run/);
        expect(out).toMatch(/Suspec spec SPEC-feat/); // the prompt is shown
        expect(out).toMatch(/suspec\/feat/); // the branch it WOULD create
        // Nothing mutated: no worktree, no run record, no prompt scratch — the write-set is unchanged.
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(filesUnder(repo)).toEqual(before);
    });

    it('renders "(none)" for setup when there is no setup config', () => {
        buildWork();
        const { out, code } = capture(() => run(['SPEC-feat', '--agent', 'stub', '--dry-run'], repo));
        expect(code).toBe(0);
        expect(out).toMatch(/setup:\s+\(none\)/);
    });
});

describe('suspec work — verdict-free reporting (AC-007)', () => {
    it('--json reports launch facts and no result/verdict/decision/pass', () => {
        buildWork();
        const { out, code } = capture(() => run(['SPEC-feat', '--agent', 'stub', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.adapter).toBe('stub');
        expect(parsed.spec).toBe('SPEC-feat');
        expect(typeof parsed.exit).toBe('number');
        for (const key of ['result', 'verdict', 'decision', 'suggestedDecision']) {
            expect(Object.keys(parsed)).not.toContain(key);
        }
        expect(out).not.toMatch(/"status"\s*:\s*"pass"/);
    });
});

describe('suspec work — guards (AC-009)', () => {
    it('exits 2 with no spec arg, outside a repo, on an unresolvable spec, and on an unknown adapter', () => {
        // no spec arg — and the usage message names the by-hand fallback (AC-010).
        const noArg = capture(() => run([], repo));
        expect(noArg.code).toBe(2);
        expect(noArg.err).toMatch(/by hand/);
        // outside a git repo
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-norepo-')));
        try {
            expect(capture(() => run(['SPEC-feat', '--agent', 'stub'], notRepo)).code).toBe(2);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
        // a repo but no matching spec
        buildWork();
        const missing = capture(() => run(['SPEC-nope', '--agent', 'stub'], repo));
        expect(missing.code).toBe(2);
        expect(missing.err).toMatch(/no spec with that id or slug/);
        // an unknown adapter — nothing launched, nothing written
        const unknown = capture(() => run(['SPEC-feat', '--agent', 'nope'], repo));
        expect(unknown.code).toBe(2);
        expect(unknown.err).toMatch(/unknown agent "nope"/);
        expect(existsSync(join(repo, '.worktrees'))).toBe(false);
        expect(existsSync(join(repo, '.suspec', 'work'))).toBe(false);
    });

    it('a non-zero agent exit is surfaced as a warning (exit 1), recorded, not suspec`s own failure', () => {
        buildWork({ exit: 3 });
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(1);
        expect(JSON.parse(readFileSync(join(repo, '.suspec', 'work', 'spec-feat.json'), 'utf8')).exit).toBe(3);
    });

    it('degrades to a warning when the run record cannot be written — never crashes', () => {
        buildWork();
        // Make the run-record path a directory so write_run_record's writeFileSync throws EISDIR. The
        // prompt scratch (a different filename) still writes, isolating the record-write degradation branch.
        mkdirSync(join(repo, '.suspec', 'work', 'spec-feat.json'), { recursive: true });
        const { code, err } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo));
        expect(code).toBe(0); // the agent launched + exited 0; the failed record write is only a warning
        expect(err).toMatch(/could not write the run record/);
    });

    it('omits changed_files when the repo HEAD is detached (a diff base is unresolvable)', () => {
        buildWork();
        capture(() => run(['SPEC-feat', '--agent', 'stub'], repo)); // create the worktree
        git(['checkout', '--detach']); // detach the repo HEAD → current_branch is null → no diff base
        const { code } = capture(() => run(['SPEC-feat', '--agent', 'stub'], repo)); // reuse; diff omitted
        expect(code).toBe(0);
        const record = JSON.parse(readFileSync(join(repo, '.suspec', 'work', 'spec-feat.json'), 'utf8'));
        expect(record.changed_files).toBeUndefined();
    });
});

describe('suspec work — the by-hand fallback is documented (AC-010)', () => {
    it('the catalog usage names the no-CLI path', () => {
        const work = COMMAND_CATALOG.find((c) => c.name === 'work');
        expect(work).toBeDefined();
        expect(work?.usage.join('\n')).toMatch(/by hand.*create the worktree/s);
    });
});
