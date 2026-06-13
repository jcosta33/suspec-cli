import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { run } from '../useCases/worktree.ts';

let repo: string;
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-wt-cmd-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    git(['commit', '--allow-empty', '-m', 'init']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

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

describe('worktree command (direct surface, AC-009/010/002)', () => {
    it('create → exit 0 and the worktree exists on swarm/<slug>', async () => {
        const { code } = await capture(() => run(['create', 'checkout'], repo));
        expect(code).toBe(0);
        expect(git(['worktree', 'list'])).toContain('swarm/checkout');
    });

    it('create with --task makes a per-task branch; a second create reuses', async () => {
        const first = await capture(() => run(['create', 'checkout', '--task', 'ac-1'], repo));
        expect(first.code).toBe(0);
        expect(git(['worktree', 'list'])).toContain('swarm/checkout/ac-1');
        const second = await capture(() => run(['create', 'checkout', '--task', 'ac-1'], repo));
        expect(second.code).toBe(0);
        expect(second.out).toContain('reusing');
    });

    it('create with no slug → usage error exit 2', async () => {
        const { code, err } = await capture(() => run(['create'], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage');
    });

    it('create off a missing base branch → exit 2', async () => {
        const { code } = await capture(() => run(['create', 'x', '--base', 'no-such-branch'], repo));
        expect(code).toBe(2);
    });

    it('list → exit 0; --json parses', async () => {
        await capture(() => run(['create', 'checkout'], repo));
        const human = await capture(() => run(['list'], repo));
        expect(human.code).toBe(0);
        const machine = await capture(() => run(['list', '--json'], repo));
        expect(JSON.parse(machine.out).worktrees.some((w: { branch: string }) => w.branch === 'swarm/checkout')).toBe(true);
    });

    it('remove --force → exit 0; remove with no slug → exit 2', async () => {
        await capture(() => run(['create', 'checkout'], repo));
        const removed = await capture(() => run(['remove', 'checkout', '--force'], repo));
        expect(removed.code).toBe(0);
        expect(git(['worktree', 'list'])).not.toContain('swarm/checkout');
        expect((await capture(() => run(['remove'], repo))).code).toBe(2);
    });

    it('prune → exit 0', async () => {
        expect((await capture(() => run(['prune'], repo))).code).toBe(0);
    });

    it('an unknown subcommand → exit 2', async () => {
        const { code, err } = await capture(() => run(['frobnicate'], repo));
        expect(code).toBe(2);
        expect(err).toContain('unknown worktree subcommand');
    });

    it('outside a git repo → exit 2', async () => {
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect((await capture(() => run(['list'], notRepo))).code).toBe(2);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });
});
