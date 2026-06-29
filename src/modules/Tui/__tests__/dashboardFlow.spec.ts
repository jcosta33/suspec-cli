import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_dashboard_flow } from '../useCases/dashboardFlow.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-dash-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('run_dashboard_flow', () => {
    it('quits cleanly on the quit choice and on cancel', async () => {
        expect(await run_dashboard_flow(create_mock_prompter({ select: ['quit'] }), { cwd: ws })).toBe(0);
        const cancelled = create_mock_prompter({ select: [CANCEL] });
        expect(await run_dashboard_flow(cancelled, { cwd: ws })).toBe(0);
        expect(cancelled.calls.outros).toContain('Bye.');
    });

    it('routes to the status flow', async () => {
        const p = create_mock_prompter({ select: ['status'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Board')).toBe(true);
    });

    it('routes to the check flow', async () => {
        mkdirSync(join(ws, 'templates'), { recursive: true });
        const p = create_mock_prompter({ select: ['check', 'workspace'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Workspace')).toBe(true);
    });

    it('routes to the new flow', async () => {
        const p = create_mock_prompter({ select: ['new', 'spec'], text: ['checkout', 'Checkout'] });
        expect(await run_dashboard_flow(p, { cwd: ws })).toBe(0);
        expect(p.calls.successes.some((s) => s.includes('SPEC-checkout'))).toBe(true);
    });

    it('routes to the worktree flow', async () => {
        const repo = realpathSync(ws);
        execFileSync('git', ['init'], { cwd: repo });
        execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: repo });
        execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
        execFileSync('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: repo });
        const p = create_mock_prompter({ select: ['worktree', 'list'] });
        expect(await run_dashboard_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Worktrees')).toBe(true);
    });
});
