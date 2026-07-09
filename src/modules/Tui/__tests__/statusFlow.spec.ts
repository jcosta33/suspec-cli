import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { run_status_flow } from '../useCases/statusFlow.ts';

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-statusflow-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
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

describe('run_status_flow — the store summary view (ADR-0137)', () => {
    it('a repo with no store reads calm, exit 0', () => {
        const p = create_mock_prompter();
        expect(run_status_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Store')).toBe(true);
        expect(p.calls.outros[0]).toBe('nothing in flight');
    });

    it('renders the store summary and flags attention items in the outro', () => {
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n');
        const p = create_mock_prompter();
        expect(run_status_flow(p, { cwd: repo })).toBe(0);
        const note = p.calls.notes.find((n) => n.title === 'Store');
        expect(note?.message).toContain('spec-feat.md');
        expect(p.calls.outros[0]).toContain('need attention');
    });

    it('resolves the repo root through git from a subdir of a real repo', () => {
        execFileSync('git', ['init'], { cwd: repo });
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n');
        const sub = join(repo, 'packages');
        mkdirSync(sub, { recursive: true });
        const p = create_mock_prompter();
        expect(run_status_flow(p, { cwd: sub })).toBe(0);
        expect(p.calls.notes.find((n) => n.title === 'Store')?.message).toContain('spec-feat.md');
    });

    it('a store with nothing actionable reads all clear', () => {
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        writeFileSync(join(store, 'run-done.md'), '---\ntype: run\nspec: SPEC-done\nstatus: done\n---\n');
        const p = create_mock_prompter();
        expect(run_status_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.outros[0]).toBe('all clear');
    });
});
