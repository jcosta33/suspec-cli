import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

import { run } from '../useCases/review.ts';

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.

### AC-002 — two
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
scope: [AC-001, AC-002]
status: review-ready
---

# Task

## Affected areas

- \`src\`

## Run summary

- Changed files: \`src/a.ts\`
`;

function review(rows: string, status = 'needs-human'): string {
    return `---
type: review
id: REVIEW-feat
task: TASK-feat
status: ${status}
---

# Review

## Summary

x

## Changed files

- \`src/a.ts\`

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
${rows}

## Human attention

1. x

## Suggested decision

x
`;
}

let repo: string;
const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' });

async function capture(fn: () => Promise<number>): Promise<{ out: string; err: string; code: number }> {
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
        const code = await fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

// A content snapshot of a directory tree: a sorted list of `relpath\tsha256(bytes)`, plus the .git
// internal dirs skipped (their refs/index churn on read is not a workspace write). Byte-level, so an
// uncommitted edit is captured — a stricter proof than `git status` (AC-025).
function snapshot(dir: string): string {
    const entries: string[] = [];
    const walk = (current: string): void => {
        for (const name of readdirSync(current).sort()) {
            if (name === '.git') {
                continue;
            }
            const full = join(current, name);
            const stat = statSync(full);
            if (stat.isDirectory()) {
                walk(full);
            } else {
                const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
                entries.push(`${relative(dir, full)}\t${hash}`);
            }
        }
    };
    walk(dir);
    return entries.sort().join('\n');
}

// Build a finished-run workspace: repo with specs/ + tasks/ (+ optional reviews/), and a launched
// worktree on swarm/feat/feat carrying both a committed and an uncommitted change.
function buildRun(opts: { reviewRows?: string; reviewStatus?: string; dirtyWorktree?: boolean } = {}): string {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(repo, 'tasks'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), TASK);
    if (opts.reviewRows !== undefined) {
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'feat.md'), review(opts.reviewRows, opts.reviewStatus));
    }
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const wt = join(repo, '.worktrees', 'feat-feat');
    git(['worktree', 'add', '-b', 'swarm/feat/feat', wt, base]);
    // a committed change vs base
    writeFileSync(join(wt, 'committed.ts'), 'a');
    git(['add', 'committed.ts'], wt);
    git(['commit', '-m', 'work'], wt);
    if (opts.dirtyWorktree !== false) {
        writeFileSync(join(wt, 'uncommitted.ts'), 'b'); // an uncommitted change
    }
    return join(repo, '.worktrees', 'feat-feat');
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-review-cmd-')));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('review command — finished-run reconcile (AC-017/024)', () => {
    it('reconciles a finished run, surfaces facts, exits 1 (advisory warning)', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | pasted | no |' }); // AC-002 uncovered
        const { code, out } = await capture(() => run(['TASK-feat'], repo));
        expect(code).toBe(1);
        expect(out).toContain('review TASK-feat');
        expect(out).toContain('uncovered'); // AC-002
    });

    it('--json emits a machine report that parses and carries the reconcile facts', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | pasted | no |' });
        const { code, out } = await capture(() => run(['TASK-feat', '--json'], repo));
        expect(code).toBe(1);
        const parsed = JSON.parse(out);
        expect(parsed.task).toBe('TASK-feat');
        expect(parsed.coverage.map((c: { id: string }) => c.id)).toContain('AC-002');
        // the worktree's net change (committed + uncommitted) is surfaced
        expect(parsed.diffChangedFiles).toEqual(expect.arrayContaining(['committed.ts', 'uncommitted.ts']));
    });

    it('a clean reconcile exits 0', async () => {
        // cover both in-scope ids, claim the actual diff, no out-of-scope file → no facts to route.
        const task = TASK.replace('- `src`', '- `committed.ts`\n- `uncommitted.ts`').replace(
            '- Changed files: `src/a.ts`',
            '- Changed files: `committed.ts`, `uncommitted.ts`'
        );
        git(['init']);
        git(['config', 'user.email', 't@e.com']);
        git(['config', 'user.name', 'T']);
        mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
        writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), task);
        writeFileSync(
            join(repo, 'reviews', 'feat.md'),
            review('| AC-001 | Pass | p | no |\n| AC-002 | Pass | p | no |')
        );
        git(['add', '.']);
        git(['commit', '-m', 'init']);
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'feat-feat');
        git(['worktree', 'add', '-b', 'swarm/feat/feat', wt, base]);
        writeFileSync(join(wt, 'committed.ts'), 'a');
        git(['add', 'committed.ts'], wt);
        git(['commit', '-m', 'work'], wt);
        writeFileSync(join(wt, 'uncommitted.ts'), 'b');

        const { code } = await capture(() => run(['TASK-feat', '--json'], repo));
        expect(code).toBe(0);
    });

    it('rejects a flag-shaped --base value rather than passing it to git', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | p | no |' });
        // parse_flags POSIX-consumes the token after --base, so `--base --lock` yields base `--lock`;
        // the command must reject it (a git-option-injection guard), not hand it to the diff.
        const { code, err } = await capture(() => run(['TASK-feat', '--base', '--lock'], repo));
        expect(code).toBe(2);
        expect(err).toContain('--base');
    });

    it('accepts a valid --base and reconciles against it', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | p | no |' });
        const { code } = await capture(() => run(['TASK-feat', '--base', 'HEAD', '--json'], repo));
        expect([0, 1]).toContain(code); // a real reconcile (clean/warning), not a usage rejection
    });

    it('exits 2 outside a workspace, with no task, and on an unresolvable run', async () => {
        // no task arg
        expect((await capture(() => run([], repo))).code).toBe(2);
        // outside a git repo
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect((await capture(() => run(['TASK-feat'], notRepo))).code).toBe(2);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
        // a repo but no tasks/<task>.md
        git(['init']);
        git(['config', 'user.email', 't@e.com']);
        git(['config', 'user.name', 'T']);
        git(['commit', '--allow-empty', '-m', 'init']);
        expect((await capture(() => run(['TASK-missing'], repo))).code).toBe(2);
    });
});

describe('review command — the boundary (AC-023/025/026)', () => {
    it('writes nothing — a byte snapshot of workspace + worktree is identical after the run (AC-025)', async () => {
        const wt = buildRun({ reviewRows: '| AC-001 | Pass | pasted | no |', dirtyWorktree: true });
        const wsBefore = snapshot(repo);
        const wtBefore = snapshot(wt);
        await capture(() => run(['TASK-feat', '--json'], repo));
        expect(snapshot(repo)).toBe(wsBefore);
        expect(snapshot(wt)).toBe(wtBefore);
    });

    it('the output surfaces carry no Result / status:pass / merge-decision field (AC-023)', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | pasted | no |' });
        const { out } = await capture(() => run(['TASK-feat', '--json'], repo));
        const parsed = JSON.parse(out);
        for (const key of ['result', 'verdict', 'decision', 'suggestedDecision', 'mergeDecision']) {
            expect(Object.keys(parsed)).not.toContain(key);
        }
        expect(out).not.toMatch(/"status"\s*:\s*"pass"/);
    });

    it('rejects --agent (M2 performs no agent work, AC-026)', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | p | no |' });
        const { code, err } = await capture(() => run(['TASK-feat', '--agent', 'x'], repo));
        expect(code).toBe(2);
        expect(err).toContain('--agent');
    });
});

describe('review command — never prompts under --json / non-TTY (AC-027)', () => {
    const originalIsTTY = process.stdout.isTTY;
    afterEach(() => {
        process.stdout.isTTY = originalIsTTY;
    });

    it('-i with --json takes the direct path on a TTY (emits JSON, no prompt)', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | p | no |' });
        process.stdout.isTTY = true;
        const { out } = await capture(() => run(['TASK-feat', '-i', '--json'], repo));
        expect(JSON.parse(out).task).toBe('TASK-feat');
    });

    it('-i without a TTY takes the direct path (renders text, no prompt)', async () => {
        buildRun({ reviewRows: '| AC-001 | Pass | p | no |' });
        process.stdout.isTTY = false;
        const { out } = await capture(() => run(['TASK-feat', '-i'], repo));
        expect(out).toContain('review TASK-feat');
    });
});
