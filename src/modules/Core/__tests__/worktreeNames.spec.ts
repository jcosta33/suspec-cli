import { describe, it, expect } from 'vitest';

import { derive_worktree_names } from '../services/worktreeNames.ts';

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
});
