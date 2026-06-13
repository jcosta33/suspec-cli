import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { create_worktree } from '../useCases/createWorktree.ts';
import { list_swarm_worktrees } from '../useCases/listSwarmWorktrees.ts';
import { remove_worktree } from '../useCases/removeWorktree.ts';
import { prune_worktrees } from '../useCases/pruneWorktrees.ts';

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
