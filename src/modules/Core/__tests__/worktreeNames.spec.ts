import { describe, it, expect } from 'vitest';

import { derive_worktree_names, task_slug } from '../services/worktreeNames.ts';

describe('task_slug', () => {
    it('strips a leading TASK- and lower-cases — the canonical branch tail', () => {
        expect(task_slug('TASK-login-form')).toBe('login-form');
        expect(task_slug('TASK-Login-Form')).toBe('login-form');
        expect(task_slug('login-form')).toBe('login-form');
    });
});

describe('derive_worktree_names', () => {
    it('derives a whole-spec branch and worktree path', () => {
        const names = derive_worktree_names({ repoRoot: '/repo', specSlug: 'checkout' });
        expect(names.branch).toBe('swarm/checkout');
        expect(names.worktreePath).toBe('/repo/.worktrees/checkout');
    });

    it('derives a per-task branch and path when a task slug is given', () => {
        const names = derive_worktree_names({ repoRoot: '/repo', specSlug: 'checkout', taskSlug: 'ac-001' });
        expect(names.branch).toBe('swarm/checkout/ac-001');
        expect(names.worktreePath).toBe('/repo/.worktrees/checkout~ac-001');
    });

    it('gives two distinct spec/task pairs distinct paths — no flat-join collision (#25)', () => {
        const a = derive_worktree_names({ repoRoot: '/r', specSlug: 'auth', taskSlug: 'login-form' });
        const b = derive_worktree_names({ repoRoot: '/r', specSlug: 'auth-login', taskSlug: 'form' });
        expect(a.branch).not.toBe(b.branch);
        expect(a.worktreePath).not.toBe(b.worktreePath);
    });

    it('treats an empty task slug as no task', () => {
        const names = derive_worktree_names({ repoRoot: '/repo', specSlug: 'checkout', taskSlug: '' });
        expect(names.branch).toBe('swarm/checkout');
    });

    // The field-test blocker: the worktree command passes the raw `--task` value (which may be the full
    // `TASK-<slug>` id `swarm status` reports, or mixed-case), and the consumer (resolve_worktree) keys
    // off `task_slug(taskId)`. The producer must derive the SAME tail, or review/run never find the
    // worktree. Branch tail AND dir name must both be the normalized slug, and must agree across forms.
    it('normalizes a TASK-prefixed / mixed-case task slug to the canonical branch tail', () => {
        const prefixed = derive_worktree_names({ repoRoot: '/r', specSlug: 'checkout', taskSlug: 'TASK-Discount' });
        expect(prefixed.branch).toBe('swarm/checkout/discount');
        expect(prefixed.worktreePath).toBe('/r/.worktrees/checkout~discount');
    });

    it('derives the same names whether given the bare slug or the full TASK- id (producer == consumer key)', () => {
        const bare = derive_worktree_names({ repoRoot: '/r', specSlug: 'checkout', taskSlug: 'discount' });
        const id = derive_worktree_names({ repoRoot: '/r', specSlug: 'checkout', taskSlug: 'TASK-discount' });
        expect(id.branch).toBe(bare.branch);
        expect(id.worktreePath).toBe(bare.worktreePath);
    });
});
