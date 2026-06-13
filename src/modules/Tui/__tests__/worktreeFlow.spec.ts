import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_worktree_flow } from '../useCases/worktreeFlow.ts';

let repo: string;
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-wtflow-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    git(['commit', '--allow-empty', '-m', 'init']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('run_worktree_flow', () => {
    it('lists worktrees', async () => {
        const p = create_mock_prompter({ select: ['list'] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Worktrees')).toBe(true);
    });

    it('creates a worktree from a slug', async () => {
        const p = create_mock_prompter({ select: ['create'], text: ['checkout'] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(git(['worktree', 'list'])).toContain('swarm/checkout');
        expect(p.calls.successes.some((s) => s.includes('swarm/checkout'))).toBe(true);
    });

    it('removes a chosen worktree (force)', async () => {
        await run_worktree_flow(create_mock_prompter({ select: ['create'], text: ['checkout'] }), { cwd: repo });
        const p = create_mock_prompter({ select: ['remove', 'swarm/checkout'], confirm: [true] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(git(['worktree', 'list'])).not.toContain('swarm/checkout');
    });

    it('reuses an existing worktree on a repeat create', async () => {
        await run_worktree_flow(create_mock_prompter({ select: ['create'], text: ['checkout'] }), { cwd: repo });
        const p = create_mock_prompter({ select: ['create'], text: ['checkout'] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.successes.some((s) => s.startsWith('Reusing'))).toBe(true);
    });

    it('prunes', async () => {
        const p = create_mock_prompter({ select: ['prune'] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(p.calls.successes.length).toBeGreaterThan(0);
    });

    it('removes a per-task worktree (parses swarm/<spec>/<task>)', async () => {
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        git(['worktree', 'add', '-b', 'swarm/feat/ac-1', join(repo, '.worktrees', 'feat-ac-1'), base]);
        const p = create_mock_prompter({ select: ['remove', 'swarm/feat/ac-1'], confirm: [true] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(0);
        expect(git(['worktree', 'list'])).not.toContain('swarm/feat/ac-1');
    });

    it('warns when removing with no worktrees', async () => {
        const p = create_mock_prompter({ select: ['remove'] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('surfaces a remove failure (dirty worktree, no force) as exit 2', async () => {
        const create = await run_worktree_flow(create_mock_prompter({ select: ['create'], text: ['dirtyspec'] }), {
            cwd: repo,
        });
        expect(create).toBe(0);
        writeFileSync(join(repo, '.worktrees', 'dirtyspec', 'scratch.txt'), 'x');
        const p = create_mock_prompter({ select: ['remove', 'swarm/dirtyspec'], confirm: [false] });
        expect(await run_worktree_flow(p, { cwd: repo })).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });

    it('bails on cancel at each prompt', async () => {
        expect(await run_worktree_flow(create_mock_prompter({ select: [CANCEL] }), { cwd: repo })).toBe(1);
        expect(
            await run_worktree_flow(create_mock_prompter({ select: ['create'], text: [CANCEL] }), { cwd: repo })
        ).toBe(1);
        await run_worktree_flow(create_mock_prompter({ select: ['create'], text: ['x'] }), { cwd: repo });
        expect(await run_worktree_flow(create_mock_prompter({ select: ['remove', CANCEL] }), { cwd: repo })).toBe(1);
        expect(
            await run_worktree_flow(create_mock_prompter({ select: ['remove', 'swarm/x'], confirm: [CANCEL] }), {
                cwd: repo,
            })
        ).toBe(1);
    });

    it('errors cleanly outside a git repo', async () => {
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            const p = create_mock_prompter({});
            expect(await run_worktree_flow(p, { cwd: notRepo })).toBe(2);
            expect(p.calls.errors.length).toBeGreaterThan(0);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });
});
