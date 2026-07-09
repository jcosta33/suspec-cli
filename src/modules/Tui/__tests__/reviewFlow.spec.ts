import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_review_flow } from '../useCases/reviewFlow.ts';

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - notes.md
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

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-reviewflow-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    git(['init']);
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'notes.md'), 'origin\n');
    writeFileSync(join(store, 'spec-feat.md'), SPEC);
    writeFileSync(join(store, 'run-feat.md'), '---\ntype: run\nspec: SPEC-feat\nstatus: exited\n---\n\n# Run\n');
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

describe('run_review_flow — pick a store run, lint its artifacts (ADR-0137)', () => {
    it('lints the chosen run and surfaces per-artifact facts without a verdict', async () => {
        const p = create_mock_prompter({ select: ['feat'] });
        const code = await run_review_flow(p, { cwd: repo });
        expect(code).toBe(0);
        const factsNote = p.calls.notes.find((n) => n.title === 'Artifact facts');
        expect(factsNote).toBeDefined();
        expect(factsNote?.message).toContain('run-feat.md');
        expect(p.calls.outros.join('\n')).toContain('a human still owns the result');
    });

    it('a run with a lint hard-error exits blocking', async () => {
        writeFileSync(join(store, 'run-lost.md'), '---\ntype: run\nspec: SPEC-ghost\nstatus: exited\n---\n');
        const p = create_mock_prompter({ select: ['lost'] });
        const code = await run_review_flow(p, { cwd: repo });
        expect(code).toBe(2);
        expect(p.calls.outros.join('\n')).toContain('a human owns the result');
    });

    it('warns when the store has no runs', async () => {
        rmSync(join(store, 'run-feat.md'));
        const p = create_mock_prompter({});
        expect(await run_review_flow(p, { cwd: repo })).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('warns when the repo has no store yet', async () => {
        rmSync(store, { recursive: true, force: true });
        const p = create_mock_prompter({});
        expect(await run_review_flow(p, { cwd: repo })).toBe(1);
        expect(p.calls.warns.some((w) => w.includes('No store'))).toBe(true);
    });

    it('errors outside a git repository', async () => {
        const plain = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-reviewflow-plain-'));
        try {
            const p = create_mock_prompter({});
            expect(await run_review_flow(p, { cwd: plain })).toBe(2);
            expect(p.calls.errors.length).toBeGreaterThan(0);
        } finally {
            rmSync(plain, { recursive: true, force: true });
        }
    });

    it('bails when the run choice is cancelled', async () => {
        const p = create_mock_prompter({ select: [CANCEL] });
        expect(await run_review_flow(p, { cwd: repo })).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });
});
