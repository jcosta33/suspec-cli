import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_review_flow } from '../useCases/reviewFlow.ts';

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

let repo: string;
const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' });

// Build a finished-run workspace: a repo with specs/ + tasks/, and a launched worktree on
// suspec/feat/feat carrying a committed change.
beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-reviewflow-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(repo, 'tasks'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), TASK);
    git(['add', '.']);
    git(['commit', '-m', 'init']);

    const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    const wt = join(repo, '.worktrees', 'feat-feat');
    git(['worktree', 'add', '-b', 'suspec/feat/feat', wt, base]);
    writeFileSync(join(wt, 'src-a.ts'), 'x'); // an uncommitted change in the run's worktree
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('run_review_flow (AC-027)', () => {
    it('reconciles the chosen run and surfaces facts (uncovered, no packet) without a verdict', async () => {
        const p = create_mock_prompter({ select: ['TASK-feat'] });
        const code = await run_review_flow(p, { workspaceDir: repo });
        expect(code).toBe(1); // findings present → advisory warning exit
        const factsNote = p.calls.notes.find((n) => n.title === 'Reconcile facts');
        expect(factsNote).toBeDefined();
        expect(factsNote?.message).toContain('uncovered');
        // never an issued result
        expect(p.calls.outros.join('\n')).toContain('a human owns the result');
    });

    it('warns when there are no task packets', async () => {
        rmSync(join(repo, 'tasks', 'TASK-feat.md'));
        const p = create_mock_prompter({});
        expect(await run_review_flow(p, { workspaceDir: repo })).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('warns when the tasks directory does not exist at all', async () => {
        rmSync(join(repo, 'tasks'), { recursive: true, force: true });
        const p = create_mock_prompter({});
        expect(await run_review_flow(p, { workspaceDir: repo })).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('a clean reconcile shows the clean outro (a human still owns the result)', async () => {
        // Make the run clean: the worktree's change is in scope + claimed, and a review packet covers
        // every in-scope id — so no fact is surfaced and the flow takes the clean outro branch. The
        // packet under review is the BRANCH's copy (SW-004): the worker fills Affected areas + Run
        // summary IN the worktree, so write the in-scope/claimed packet there, not to the workspace
        // checkout (whose copy still holds the blank cut packet pre-merge).
        writeFileSync(
            join(repo, '.worktrees', 'feat-feat', 'tasks', 'TASK-feat.md'),
            TASK.replace('- `src`', '- `src-a.ts`').replace(
                '- Changed files: `src/a.ts`',
                '- Changed files: `src-a.ts`'
            )
        );
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        // Each Pass row carries a matching `verify` block (cmd = the spec's named command, result=pass)
        // so the C013 binding reads consistent and no fact is surfaced.
        writeFileSync(
            join(repo, 'reviews', 'feat.md'),
            `---\ntype: review\nid: REVIEW-feat\ntask: TASK-feat\nstatus: needs-human\n---\n\n## Summary\nx\n\n## Changed files\nx\n\n## Requirement coverage\n\n| ID | Result | Evidence | Human attention |\n|---|---|---|---|\n| AC-001 | Pass | p | no |\n\n\`\`\`verify id=AC-001 cmd="a test." result=pass\nok\n\`\`\`\n\n| AC-002 | Pass | p | no |\n\n\`\`\`verify id=AC-002 cmd="a test." result=pass\nok\n\`\`\`\n\n## Human attention\nx\n\n## Suggested decision\nx\n`
        );
        const p = create_mock_prompter({ select: ['TASK-feat'] });
        expect(await run_review_flow(p, { workspaceDir: repo })).toBe(0);
        expect(p.calls.outros.some((o) => o.includes('clean reconcile'))).toBe(true);
    });

    it('bails on cancel at the task prompt', async () => {
        const p = create_mock_prompter({ select: [CANCEL] });
        expect(await run_review_flow(p, { workspaceDir: repo })).toBe(1);
        expect(p.calls.outros.some((o) => o === 'Cancelled.')).toBe(true);
    });

    it('errors cleanly outside a git repo', async () => {
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-norepo-')));
        try {
            const p = create_mock_prompter({});
            expect(await run_review_flow(p, { workspaceDir: notRepo })).toBe(2);
            expect(p.calls.errors.length).toBeGreaterThan(0);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });

    it('exits 2 when the run cannot be resolved (no worktree for the task)', async () => {
        git(['worktree', 'remove', '--force', join(repo, '.worktrees', 'feat-feat')]);
        const p = create_mock_prompter({ select: ['TASK-feat'] });
        expect(await run_review_flow(p, { workspaceDir: repo })).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });
});
