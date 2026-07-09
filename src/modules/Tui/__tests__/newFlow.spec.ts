import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_new_flow } from '../useCases/newFlow.ts';

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const SPEC_X = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — one
The tool must do one.
Verify with: a test.

### AC-002 — two
The tool must do two.
Verify with: a test.
`;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-newflow-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'spec-x.md'), SPEC_X);
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

describe('run_new_flow — store spec scaffold + store task slices (ADR-0137)', () => {
    it('scaffolds a new STORE spec from a one-line intent', async () => {
        const p = create_mock_prompter({ select: ['spec'], text: ['Checkout applies the discount'] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
        const path = join(store, 'spec-checkout-applies-the-discount.md');
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf8')).toContain('status: draft');
        expect(p.calls.successes.some((s) => s.includes('SPEC-checkout-applies-the-discount'))).toBe(true);
        // nothing lands in the repo
        expect(existsSync(join(repo, 'specs'))).toBe(false);
    });

    it('cuts a task slice into the store with the chosen scope', async () => {
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
        expect(existsSync(join(store, 'task-x.md'))).toBe(true);
        expect(p.calls.successes.some((s) => s.includes('1 scoped'))).toBe(true);
    });

    it('cuts a task with empty scope when the spec has no requirements — warning about the unbounded slice', async () => {
        writeFileSync(
            join(store, 'spec-bare.md'),
            '---\ntype: spec\nid: SPEC-bare\nstatus: draft\n---\n\n## Intent\n\nnone\n'
        );
        const p = create_mock_prompter({ select: ['task', 'SPEC-bare'] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.successes.some((s) => s.includes('0 scoped'))).toBe(true);
        expect(p.calls.warns.some((w) => w.includes('EMPTY'))).toBe(true);
    });

    it('skips unparseable store specs when listing', async () => {
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter\n');
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
    });

    it('warns when the store has no specs to cut from', async () => {
        rmSync(join(store, 'spec-x.md'));
        const p = create_mock_prompter({ select: ['task'] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(1);
        expect(p.calls.warns.some((w) => w.includes('No specs in the store'))).toBe(true);
    });

    it('re-running the spec scaffold reuses the existing namesake (no clobber, exit 0)', async () => {
        await run_new_flow(create_mock_prompter({ select: ['spec'], text: ['Dup intent'] }), { cwd: repo });
        const p = create_mock_prompter({ select: ['spec'], text: ['Dup intent'] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.successes.some((s) => s.includes('Reusing'))).toBe(true);
    });

    it('an intent with no slug-able characters errors (exit 2)', async () => {
        const p = create_mock_prompter({ select: ['spec'], text: ['###'] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(2);
        expect(p.calls.errors.some((e) => e.includes('cannot derive a spec slug from "###"'))).toBe(true);
    });

    it('a second default-id cut auto-suffixes instead of conflicting', async () => {
        await run_new_flow(create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] }), {
            cwd: repo,
        });
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-002']] });
        expect(await run_new_flow(p, { cwd: repo })).toBe(0);
        expect(existsSync(join(store, 'task-x-2.md'))).toBe(true);
    });

    it('surfaces a cut failure as exit 2 (a read-only store rejects the write)', async () => {
        chmodSync(store, 0o500); // listable, not writable → the atomic slice write fails
        try {
            const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] });
            expect(await run_new_flow(p, { cwd: repo })).toBe(2);
            expect(p.calls.errors.length).toBeGreaterThan(0);
            expect(p.calls.outros[0]).toContain('could not cut');
        } finally {
            chmodSync(store, 0o700);
        }
    });

    it('surfaces a store-resolution failure as exit 2', async () => {
        const saved = process.env.SUSPEC_STATE_DIR;
        const blocker = join(root, 'state-as-file');
        writeFileSync(blocker, 'not a dir\n');
        process.env.SUSPEC_STATE_DIR = join(blocker, 'nested'); // mkdir under a file fails
        try {
            const p = create_mock_prompter({});
            expect(await run_new_flow(p, { cwd: repo })).toBe(2);
            expect(p.calls.outros[0]).toContain('no store');
        } finally {
            process.env.SUSPEC_STATE_DIR = saved;
        }
    });

    it('resolves the repo root through git when the cwd is a real repo', async () => {
        execFileSync('git', ['init'], { cwd: repo });
        const sub = join(repo, 'packages');
        mkdirSync(sub, { recursive: true });
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-002']] });
        expect(await run_new_flow(p, { cwd: sub })).toBe(0); // the store keyed by the repo ROOT, not the subdir
        expect(existsSync(join(store, 'task-x.md'))).toBe(true);
    });

    it('bails on cancel at each prompt', async () => {
        expect(await run_new_flow(create_mock_prompter({ select: [CANCEL] }), { cwd: repo })).toBe(1);
        expect(await run_new_flow(create_mock_prompter({ select: ['spec'], text: [CANCEL] }), { cwd: repo })).toBe(1);
        expect(await run_new_flow(create_mock_prompter({ select: ['task', CANCEL] }), { cwd: repo })).toBe(1);
        expect(
            await run_new_flow(create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [CANCEL] }), {
                cwd: repo,
            })
        ).toBe(1);
    });
});
