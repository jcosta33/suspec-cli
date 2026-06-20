import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { create_worktree } from '../useCases/createWorktree.ts';
import { list_swarm_worktrees } from '../useCases/listSwarmWorktrees.ts';
import { remove_worktree } from '../useCases/removeWorktree.ts';
import { prune_worktrees } from '../useCases/pruneWorktrees.ts';
import { resolve_worktree } from '../useCases/taskLocator.ts';

// Integration: drives the launch engine against a real throwaway git repo — the fidelity AC-009's
// Verify line asks for ("git worktree list shows it on the right branch; remove → gone").

let repoRoot: string;
let baseBranch: string;

const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

beforeAll(() => {
    repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-launch-')));
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['commit', '--allow-empty', '-m', 'init']);
    baseBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
});

afterAll(() => {
    rmSync(repoRoot, { recursive: true, force: true });
});

describe('the launch engine over a real git repo', () => {
    it('creates a worktree on swarm/<spec-slug>, lists it, is idempotent, removes it, prunes', () => {
        const created = assertOk(create_worktree({ repoRoot, specSlug: 'checkout', baseBranch }));
        expect(created.branch).toBe('swarm/checkout');
        expect(created.reused).toBe(false);
        expect(git(['worktree', 'list']).includes(created.worktreePath)).toBe(true);

        const listed = list_swarm_worktrees(repoRoot);
        expect(listed.worktrees.map((w) => w.branch)).toContain('swarm/checkout');

        const again = assertOk(create_worktree({ repoRoot, specSlug: 'checkout', baseBranch }));
        expect(again.reused).toBe(true);

        const removed = assertOk(remove_worktree({ repoRoot, specSlug: 'checkout', force: true }));
        expect(removed.branch).toBe('swarm/checkout');
        expect(list_swarm_worktrees(repoRoot).worktrees.map((w) => w.branch)).not.toContain('swarm/checkout');

        expect(assertOk(prune_worktrees(repoRoot)).level).toBe('clean');
    });

    it('removing a worktree that does not exist is a clean error, not a crash', () => {
        const failure = assertErr(remove_worktree({ repoRoot, specSlug: 'never-made', force: true }));
        expect(failure._tag).toBe('WorktreeNotFound');
    });

    it('a per-task slug yields a swarm/<spec>/<task> branch', () => {
        // A fresh spec slug: git refs are files, so swarm/checkout (a branch from the prior test)
        // and swarm/checkout/ac-009 cannot coexist (D/F conflict). The two ADR-0046 naming schemes
        // are alternatives for a given spec, never used together.
        const created = assertOk(create_worktree({ repoRoot, specSlug: 'payments', taskSlug: 'ac-009', baseBranch }));
        expect(created.branch).toBe('swarm/payments/ac-009');
        assertOk(remove_worktree({ repoRoot, specSlug: 'payments', taskSlug: 'ac-009', force: true }));
    });

    it('a worktree created from a TASK-prefixed --task is found by the consumer keyed on either form (field-test blocker)', () => {
        // The adopter passes the full id `swarm status` reports (`TASK-Discount`); the producer must
        // write the SAME normalized branch tail the consumer (review/run via resolve_worktree) computes
        // from the task id, or the worktree is never found. Round-trip both the prefixed id + bare slug,
        // and confirm remove (which derives the branch the same way) tears the normalized branch down.
        const created = assertOk(
            create_worktree({ repoRoot, specSlug: 'discounts', taskSlug: 'TASK-Discount', baseBranch })
        );
        expect(created.branch).toBe('swarm/discounts/discount');

        const byId = resolve_worktree(repoRoot, 'discounts', 'TASK-Discount');
        const bySlug = resolve_worktree(repoRoot, 'discounts', 'discount');
        expect(byId?.branch).toBe('swarm/discounts/discount');
        expect(byId?.path).toBe(created.worktreePath);
        expect(bySlug?.path).toBe(created.worktreePath);

        assertOk(remove_worktree({ repoRoot, specSlug: 'discounts', taskSlug: 'TASK-Discount', force: true }));
        expect(list_swarm_worktrees(repoRoot).worktrees.map((w) => w.branch)).not.toContain('swarm/discounts/discount');
    });
});

describe('the launch engine surfaces git failures as Err (exit 2), never a crash', () => {
    it('create off a missing base branch fails cleanly', () => {
        const failure = assertErr(create_worktree({ repoRoot, specSlug: 'badbase', baseBranch: 'no-such-base' }));
        expect(failure._tag).toBe('WorktreeCreateFailed');
    });

    it('remove without --force on a dirty worktree fails cleanly', () => {
        const created = assertOk(create_worktree({ repoRoot, specSlug: 'dirtyspec', baseBranch }));
        writeFileSync(join(created.worktreePath, 'scratch.txt'), 'uncommitted');
        const failure = assertErr(remove_worktree({ repoRoot, specSlug: 'dirtyspec', force: false }));
        expect(failure._tag).toBe('WorktreeRemoveFailed');
        assertOk(remove_worktree({ repoRoot, specSlug: 'dirtyspec', force: true }));
    });

    it('prune outside a git repo fails cleanly', () => {
        const notARepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-norepo-')));
        try {
            expect(assertErr(prune_worktrees(notARepo))._tag).toBe('WorktreePruneFailed');
        } finally {
            rmSync(notARepo, { recursive: true, force: true });
        }
    });
});

describe('the launch engine stamps runtime isolation (AC-010)', () => {
    it('stamps distinct ports for two worktrees when a range is configured', () => {
        const readConfig = () => ({ portRangeStart: 4000, portRangeSize: 1000 });
        const writes: { path: string; content: string }[] = [];
        const writeStamp = (path: string, content: string) => writes.push({ path, content });

        const one = assertOk(create_worktree({ repoRoot, specSlug: 'iso-a', baseBranch, readConfig, writeStamp }));
        const two = assertOk(create_worktree({ repoRoot, specSlug: 'iso-b', baseBranch, readConfig, writeStamp }));

        expect(one.port).not.toBeNull();
        expect(two.port).not.toBeNull();
        expect(one.port).not.toBe(two.port);
        expect(writes).toHaveLength(2);
        expect(writes.every((w) => w.path.endsWith('.swarm-runtime.json'))).toBe(true);

        assertOk(remove_worktree({ repoRoot, specSlug: 'iso-a', force: true }));
        assertOk(remove_worktree({ repoRoot, specSlug: 'iso-b', force: true }));
    });

    it('is a no-op (port null, no stamp written) when no range is configured', () => {
        const writes: string[] = [];
        const created = assertOk(
            create_worktree({
                repoRoot,
                specSlug: 'iso-none',
                baseBranch,
                readConfig: () => null,
                writeStamp: (path) => writes.push(path),
            })
        );
        expect(created.port).toBeNull();
        expect(writes).toEqual([]);
        assertOk(remove_worktree({ repoRoot, specSlug: 'iso-none', force: true }));
    });

    it('does not throw when a reused worktree dir is missing but a config is set (stale admin entry → port null)', () => {
        const cfg = () => ({ portRangeStart: 4000, portRangeSize: 100 });
        const created = assertOk(create_worktree({ repoRoot, specSlug: 'iso-stale', baseBranch, readConfig: cfg }));
        expect(created.port).not.toBeNull();
        rmSync(created.worktreePath, { recursive: true, force: true }); // remove the dir, keep the admin entry
        const reused = assertOk(create_worktree({ repoRoot, specSlug: 'iso-stale', baseBranch, readConfig: cfg }));
        expect(reused.reused).toBe(true);
        expect(reused.port).toBeNull(); // stamp skipped (dir gone), no ENOENT thrown
        assertOk(prune_worktrees(repoRoot));
    });

    it('reads runtimeIsolation from swarm.config.json on disk by default', () => {
        const isoRepo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-iso-')));
        const isoGit = (args: string[]) => execFileSync('git', args, { cwd: isoRepo, encoding: 'utf8' });
        try {
            isoGit(['init']);
            isoGit(['config', 'user.email', 'test@example.com']);
            isoGit(['config', 'user.name', 'Test']);
            isoGit(['commit', '--allow-empty', '-m', 'init']);
            const base = isoGit(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

            // No config file → no-op.
            expect(
                assertOk(create_worktree({ repoRoot: isoRepo, specSlug: 'cfg-none', baseBranch: base })).port
            ).toBeNull();

            // Malformed JSON → no-op (never throws).
            writeFileSync(join(isoRepo, 'swarm.config.json'), '{ not valid json');
            expect(
                assertOk(create_worktree({ repoRoot: isoRepo, specSlug: 'cfg-bad', baseBranch: base })).port
            ).toBeNull();

            // Valid config → a port in range + the fixture written to the worktree.
            writeFileSync(
                join(isoRepo, 'swarm.config.json'),
                JSON.stringify({ runtimeIsolation: { portRangeStart: 7000, portRangeSize: 10 } })
            );
            const stamped = assertOk(create_worktree({ repoRoot: isoRepo, specSlug: 'cfg-ok', baseBranch: base }));
            expect(stamped.port).not.toBeNull();
            expect(stamped.port).toBeGreaterThanOrEqual(7000);
            expect(stamped.port).toBeLessThan(7010);
            expect(existsSync(join(stamped.worktreePath, '.swarm-runtime.json'))).toBe(true);
        } finally {
            rmSync(isoRepo, { recursive: true, force: true });
        }
    });
});
