import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

import { run } from '../useCases/review.ts';
import { run as runCheck } from '../useCases/check.ts';

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
        // Each Pass row carries a matching `verify` block (cmd = the spec's named command, result=pass)
        // so the C013 binding reads consistent and the reconcile stays genuinely clean.
        writeFileSync(
            join(repo, 'reviews', 'feat.md'),
            review(
                '| AC-001 | Pass | p | no |\n' +
                    '\n```verify id=AC-001 cmd="a test." result=pass\nok (1 passed)\n```\n\n' +
                    '| AC-002 | Pass | p | no |\n' +
                    '\n```verify id=AC-002 cmd="a test." result=pass\nok (1 passed)\n```'
            )
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

    it('`--write` leaves a pre-existing status.md (the board) byte-unchanged — the reconcile-only boundary (AC-003/025, ADR-0084 D3)', async () => {
        // The draft writer is the one shipped command that writes a file, so it is the most likely place
        // a future board mutation would creep in ("after drafting, flip the board row"). The static
        // no-board-write scan (Core/noBoardWrite.spec.ts) cannot see a path built from variables; this is
        // the runtime backstop for `review --write` specifically (pull/promote get the same there). A
        // pre-existing board is present so a write that EDITS the board — not just creates status.md —
        // is caught too; the line-376 AC-004 test alone cannot, its fixture has no board.
        buildRun(); // a finished run, no pre-existing review packet
        const board = '# Board\n\n| spec | task | review |\n| --- | --- | --- |\n| SPEC-feat | TASK-feat | — |\n';
        const boardPath = join(repo, 'status.md');
        writeFileSync(boardPath, board);
        const mtimeBefore = statSync(boardPath).mtimeMs;

        const { code } = await capture(() => run(['TASK-feat', '--write'], repo));
        expect(code).toBe(0);
        expect(existsSync(join(repo, 'reviews', 'feat.md'))).toBe(true); // the draft landed
        // ...and the board is byte-identical AND untouched (mtime preserved → it was never written).
        expect(readFileSync(boardPath, 'utf8')).toBe(board);
        expect(statSync(boardPath).mtimeMs).toBe(mtimeBefore);
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

describe('review command — the draft writer (W4b, AC-001/002/003/004/005)', () => {
    const draftPath = () => join(repo, 'reviews', 'feat.md');

    it('--write creates reviews/<slug>.md: one row per in-scope id, the diff files, routed attention (AC-001)', async () => {
        buildRun(); // no pre-existing review packet
        const { code } = await capture(() => run(['TASK-feat', '--write'], repo));
        expect(code).toBe(0);
        const draft = readFileSync(draftPath(), 'utf8');
        // one coverage row per in-scope id (AC-001, AC-002)
        expect(draft).toMatch(/\| AC-001 \| Unverified \|/);
        expect(draft).toMatch(/\| AC-002 \| Unverified \|/);
        // the worktree's net change (committed + uncommitted) is listed under Changed files
        expect(draft).toContain('- `committed.ts`');
        expect(draft).toContain('- `uncommitted.ts`');
        // no review packet yet → the uncovered candidates route to Human attention
        expect(draft).toContain('No review packet yet');
    });

    it('every written Result is Unverified, incl. a row whose reconcile found a matching C013 block (AC-002)', async () => {
        // A pre-existing packet whose AC-001 row carries a CONSISTENT verify block (cmd = the spec's
        // `a test.`, result=pass); regenerate over it with --force so the reconcile sees the block.
        buildRun({
            reviewRows:
                '| AC-001 | Pass | p | no |\n' +
                '\n```verify id=AC-001 cmd="a test." result=pass\nok (1 passed)\n```\n',
        });
        const { code } = await capture(() => run(['TASK-feat', '--write', '--force'], repo));
        expect(code).toBe(0);
        const draft = readFileSync(draftPath(), 'utf8');
        // EVERY row Unverified — no Pass slipped in, even for the row backed by a consistent block.
        expect(draft).not.toMatch(/\|\s*Pass\s*\|/);
        expect(draft).toMatch(/\| AC-001 \| Unverified \| `a test\.` recorded result=pass \|/);
    });

    it('the written frontmatter is status: draft, never a terminal status (AC-003)', async () => {
        buildRun();
        await capture(() => run(['TASK-feat', '--write'], repo));
        const draft = readFileSync(draftPath(), 'utf8');
        expect(draft).toMatch(/^status: draft$/m);
        expect(draft).not.toMatch(/^status:\s*(pass|waived|blocked|needs-human)\s*$/m);
    });

    it('a second --write over an existing packet errors and needs --force; only the one file is written (AC-004)', async () => {
        const wt = buildRun();
        await capture(() => run(['TASK-feat', '--write'], repo)); // first write
        // Snapshot the workspace (incl. the draft) + worktree; a second --write must change nothing.
        const wsBefore = snapshot(repo);
        const wtBefore = snapshot(wt);
        const { code, err } = await capture(() => run(['TASK-feat', '--write'], repo));
        expect(code).toBe(2); // refuse to clobber
        expect(err).toMatch(/refusing to overwrite|already/i);
        expect(snapshot(repo)).toBe(wsBefore); // byte-unchanged: nothing written on the refusal
        expect(snapshot(wt)).toBe(wtBefore);
        // --force replaces exactly the one packet.
        const { code: forced } = await capture(() => run(['TASK-feat', '--write', '--force'], repo));
        expect(forced).toBe(0);
    });

    it('--write writes exactly the one draft file — no other workspace/worktree byte changes (AC-004)', async () => {
        const wt = buildRun();
        const wsBefore = snapshot(repo);
        const wtBefore = snapshot(wt);
        await capture(() => run(['TASK-feat', '--write'], repo));
        // The only new path is reviews/feat.md; the worktree is byte-unchanged.
        const wsAfter = snapshot(repo).split('\n');
        const added = wsAfter.filter((line) => !wsBefore.split('\n').includes(line));
        expect(added).toHaveLength(1);
        expect(added[0]).toMatch(/^reviews\/feat\.md\t/);
        expect(snapshot(wt)).toBe(wtBefore);
    });

    it('swarm check on a freshly written draft reports no structural finding beyond all-Unverified coverage (AC-005)', async () => {
        buildRun();
        await capture(() => run(['TASK-feat', '--write'], repo));
        const { code, out } = await capture(() => runCheck([draftPath(), '--json'], repo));
        // C012 sees one covered row per in-scope id (no uncovered/orphan); C013 keys on Pass rows and
        // there are none → clean. No malformed-section / orphan-row finding from the scaffold.
        const parsed = JSON.parse(out);
        expect(parsed.diagnostics).toEqual([]);
        expect(code).toBe(0);
    });

    it('the default (no --write) stays M2 read-only: stdout reconcile, no file written (AC-001 default)', async () => {
        const wt = buildRun();
        const wsBefore = snapshot(repo);
        const wtBefore = snapshot(wt);
        const { out } = await capture(() => run(['TASK-feat'], repo));
        expect(out).toContain('review TASK-feat'); // the M2 stdout reconcile
        expect(existsSync(draftPath())).toBe(false); // nothing written
        expect(snapshot(repo)).toBe(wsBefore);
        expect(snapshot(wt)).toBe(wtBefore);
    });

    it('--write surfaces a draft error (an empty-scope task packet) as exit 2, writing nothing (AC-004)', async () => {
        // A finished run whose task packet declares no scope: the run resolves, but the writer refuses
        // to draft (nothing to cover). This exercises the command's draft-error arm.
        const emptyScopeTask = TASK.replace('scope: [AC-001, AC-002]', 'scope: []');
        git(['init']);
        git(['config', 'user.email', 't@e.com']);
        git(['config', 'user.name', 'T']);
        mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
        writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), emptyScopeTask);
        git(['add', '.']);
        git(['commit', '-m', 'init']);
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'feat-feat');
        git(['worktree', 'add', '-b', 'swarm/feat/feat', wt, base]);
        writeFileSync(join(wt, 'committed.ts'), 'a');
        git(['add', 'committed.ts'], wt);
        git(['commit', '-m', 'work'], wt);

        const { code, err } = await capture(() => run(['TASK-feat', '--write'], repo));
        expect(code).toBe(2);
        expect(err).toContain('no scope');
        expect(existsSync(draftPath())).toBe(false); // nothing written on the draft error
    });

    it('--write --json emits a machine record carrying status: draft and the path (AC-006 verdict-free)', async () => {
        buildRun();
        const { out, code } = await capture(() => run(['TASK-feat', '--write', '--json'], repo));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.status).toBe('draft');
        expect(parsed.path).toMatch(/reviews\/feat\.md$/);
        // No verdict / merge decision field of its own.
        for (const key of ['result', 'verdict', 'decision', 'suggestedDecision', 'mergeDecision']) {
            expect(Object.keys(parsed)).not.toContain(key);
        }
    });
});
