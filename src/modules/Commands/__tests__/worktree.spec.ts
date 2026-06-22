import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
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

    it("create --task derives the branch tail from the resolved task's frontmatter id, not the raw arg (SW-005)", async () => {
        // A task whose FILENAME stem differs from its frontmatter `id` — so the branch tail can only be
        // right if create resolves the task and uses its canonical id (`TASK-real-name` → `real-name`),
        // not the --task arg (which would give `alias`). This is exactly what review/run key off.
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(join(repo, 'tasks', 'TASK-alias.md'), '---\ntype: task\nid: TASK-real-name\n---\n');
        const created = await capture(() => run(['create', 'checkout', '--task', 'TASK-alias'], repo));
        expect(created.code).toBe(0);
        expect(git(['worktree', 'list'])).toContain('swarm/checkout/real-name');
        expect(git(['worktree', 'list'])).not.toContain('swarm/checkout/alias');
    });

    it('create --task that names no cut task fails early, listing the real tasks — never a silent mismatch (SW-005)', async () => {
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(
            join(repo, 'tasks', 'TASK-checkout-discount.md'),
            '---\ntype: task\nid: TASK-checkout-discount\n---\n'
        );
        // The worker guesses the capability name (`discount`) rather than the task id tail — the old code
        // made a branch nothing could find. Now it errors early with the valid options and creates nothing.
        const { code, err } = await capture(() => run(['create', 'checkout', '--task', 'discount'], repo));
        expect(code).toBe(2);
        expect(err).toContain('no task matching "discount"');
        expect(err).toContain('TASK-checkout-discount');
        expect(git(['worktree', 'list'])).not.toContain('swarm/checkout');
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
        expect(JSON.parse(machine.out).worktrees.some((w: { branch: string }) => w.branch === 'swarm/checkout')).toBe(
            true
        );
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

    it('no subcommand (non-TTY) → prints usage, never the literal "undefined"', async () => {
        const { code, err } = await capture(() => run([], repo));
        expect(code).toBe(2);
        expect(err).toContain('usage: swarm worktree');
        expect(err).not.toContain('undefined');
    });

    it('create on a repo with no commits → exit 2 with a helpful message, not a raw git error', async () => {
        const fresh = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-nocommit-')));
        execFileSync('git', ['init'], { cwd: fresh });
        try {
            const { code, err } = await capture(() => run(['create', 'checkout'], fresh));
            expect(code).toBe(2);
            expect(err).toContain('no commits');
            expect(err).not.toContain('invalid reference');
        } finally {
            rmSync(fresh, { recursive: true, force: true });
        }
    });

    it('rejects a flag-shaped --base before it reaches git (no option injection) → exit 2', async () => {
        const { code, err } = await capture(() => run(['create', 'checkout', '--base', '-x'], repo));
        expect(code).toBe(2);
        expect(err).toContain('invalid --base');
        expect(git(['worktree', 'list'])).not.toContain('swarm/checkout');
    });

    it('outside a git repo → exit 2', async () => {
        const notRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect((await capture(() => run(['list'], notRepo))).code).toBe(2);
        } finally {
            rmSync(notRepo, { recursive: true, force: true });
        }
    });

    it('create advises when the base branch is ahead of its remote (#46)', async () => {
        // Stand up an origin remote, push the base, then add an unpushed local commit so the base is
        // ahead of its remote — the advisory must surface so a PR is not cut on an unpushed base.
        const remote = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-wt-remote-')));
        try {
            execFileSync('git', ['init', '--bare'], { cwd: remote, encoding: 'utf8' });
            git(['remote', 'add', 'origin', remote]);
            const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
            git(['push', '-u', 'origin', base]);
            git(['commit', '--allow-empty', '-m', 'unpushed local']);
            const { code, out } = await capture(() => run(['create', 'checkout'], repo));
            expect(code).toBe(0); // advisory is non-fatal
            expect(out).toContain(`base "${base}" is 1 commit(s) ahead of its remote`);
            expect(out).toContain('push the base first');
        } finally {
            rmSync(remote, { recursive: true, force: true });
        }
    });

    it('create does NOT advise when the base is in sync with (or has no) remote (#46)', async () => {
        // The default repo here has no remote → no advisory line, just the created/port output.
        const { code, out } = await capture(() => run(['create', 'checkout'], repo));
        expect(code).toBe(0);
        expect(out).not.toContain('ahead of its remote');
    });

    it('create with a runtime-isolation config surfaces the assigned port (AC-010)', async () => {
        writeFileSync(
            join(repo, 'swarm.config.json'),
            JSON.stringify({ runtimeIsolation: { portRangeStart: 6000, portRangeSize: 20 } })
        );
        const { out, code } = await capture(() => run(['create', 'checkout'], repo));
        expect(code).toBe(0);
        expect(out).toContain('runtime port');
    });

    it('create --json carries the port field when runtime isolation is configured (AC-010/008)', async () => {
        writeFileSync(
            join(repo, 'swarm.config.json'),
            JSON.stringify({ runtimeIsolation: { portRangeStart: 6000, portRangeSize: 20 } })
        );
        const { out } = await capture(() => run(['create', 'checkout', '--json'], repo));
        const parsed = JSON.parse(out) as { port: number };
        expect(typeof parsed.port).toBe('number');
        expect(parsed.port).toBeGreaterThanOrEqual(6000);
        expect(parsed.port).toBeLessThan(6020);
    });
});
