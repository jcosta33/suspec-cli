import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_dashboard_flow } from '../useCases/dashboardFlow.ts';

let root: string;
let ws: string;
let savedStateDir: string | undefined;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-dash-'));
    ws = join(root, 'proj');
    mkdirSync(ws, { recursive: true });
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = join(root, 'state');
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
});

describe('run_dashboard_flow', () => {
    it('quits cleanly on the quit choice and on cancel', async () => {
        expect(await run_dashboard_flow(create_mock_prompter({ select: ['quit'] }), { cwd: ws })).toBe(0);
        const cancelled = create_mock_prompter({ select: [CANCEL] });
        expect(await run_dashboard_flow(cancelled, { cwd: ws })).toBe(0);
        expect(cancelled.calls.outros).toContain('Bye.');
    });

    it('routes to the status flow (the store summary)', async () => {
        const p = create_mock_prompter({ select: ['status'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Store')).toBe(true);
    });

    it('routes to the check flow (the store lint)', async () => {
        const p = create_mock_prompter({ select: ['check', 'store'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Store')).toBe(true);
    });

    it('routes to the review flow (store runs)', async () => {
        const repo = ws;
        execFileSync('git', ['init'], { cwd: repo });
        const store = join(root, 'state', basename(repo));
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, '.repo-path'), `${repo}\n`);
        const p = create_mock_prompter({ select: ['review'] });
        expect(await run_dashboard_flow(p, { cwd: repo })).toBe(1); // no runs yet → the warn path
        expect(p.calls.warns.some((w) => w.includes('No runs'))).toBe(true);
    });

    it('routes to the new flow (the store spec scaffold)', async () => {
        const p = create_mock_prompter({ select: ['new', 'spec'], text: ['Checkout applies the discount'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.successes.some((s) => s.includes('SPEC-checkout'))).toBe(true);
    });

    it('routes to the worktree flow', async () => {
        const repo = ws;
        execFileSync('git', ['init'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
        execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: repo });
        const p = create_mock_prompter({ select: ['worktree', 'list'] });
        expect(await run_dashboard_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Worktrees')).toBe(true);
    });
});
