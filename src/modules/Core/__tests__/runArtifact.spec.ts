import { describe, it, expect } from 'vitest';

import {
    build_run_content,
    read_run_lock,
    is_heartbeat_fresh,
    reclaim_run_content,
    finish_run_content,
    abort_run_content,
    HEARTBEAT_FRESH_MS,
} from '../services/runArtifact.ts';

// SPEC-suspec-v2 AC-006/AC-008: the run file's CLI-owned frontmatter — the run record (type, spec,
// worktree, branch, base_sha, status) + the lock (pid, heartbeat) — with the agent-owned body
// preserved across every CLI rewrite.

const FIELDS = {
    specId: 'SPEC-auth',
    worktree: '/repo/.worktrees/auth',
    branch: 'suspec/auth',
    baseSha: 'abc123',
    pid: 4242,
    heartbeat: '2026-07-09T10:00:00.000Z',
};

describe('build_run_content (AC-006/008)', () => {
    it('records type run, the spec id, worktree, branch, base_sha, status live, pid + heartbeat', () => {
        const content = build_run_content(FIELDS);
        expect(content).toMatch(/^---\ntype: run\nspec: SPEC-auth\n/);
        expect(content).toContain('worktree: /repo/.worktrees/auth');
        expect(content).toContain('branch: suspec/auth');
        expect(content).toContain('base_sha: abc123');
        expect(content).toContain('status: live');
        expect(content).toContain('pid: 4242');
        expect(content).toContain('heartbeat: 2026-07-09T10:00:00.000Z');
        expect(content).toContain('Append run and evidence notes below');
    });

    it('omits base_sha in a repo with no commits (null), rather than writing an empty scalar', () => {
        expect(build_run_content({ ...FIELDS, baseSha: null })).not.toContain('base_sha');
    });
});

describe('read_run_lock (AC-008)', () => {
    it('reads status, pid, heartbeat, worktree, and branch back from the frontmatter', () => {
        const lock = read_run_lock(build_run_content(FIELDS));
        expect(lock).toEqual({
            status: 'live',
            pid: 4242,
            heartbeat: '2026-07-09T10:00:00.000Z',
            worktree: '/repo/.worktrees/auth',
            branch: 'suspec/auth',
        });
    });

    it('degrades missing or malformed fields to null — a lock that cannot be read never blocks', () => {
        expect(read_run_lock('no frontmatter at all')).toEqual({
            status: null,
            pid: null,
            heartbeat: null,
            worktree: null,
            branch: null,
        });
        expect(read_run_lock('---\npid: not-a-number\n---\n').pid).toBeNull();
    });
});

describe('is_heartbeat_fresh (AC-008)', () => {
    const now = Date.parse('2026-07-09T10:00:00.000Z');

    it('is fresh under the 15-minute default and dead at/after it', () => {
        expect(is_heartbeat_fresh('2026-07-09T09:59:00.000Z', now)).toBe(true);
        expect(is_heartbeat_fresh('2026-07-09T09:46:00.000Z', now)).toBe(true); // 14 min
        expect(is_heartbeat_fresh('2026-07-09T09:45:00.000Z', now)).toBe(false); // exactly 15 min — dead
        expect(is_heartbeat_fresh('2026-07-09T08:00:00.000Z', now)).toBe(false);
        expect(HEARTBEAT_FRESH_MS).toBe(15 * 60 * 1000);
    });

    it('honors an explicit threshold, and reads a missing/unparseable heartbeat as dead', () => {
        expect(is_heartbeat_fresh('2026-07-09T09:59:30.000Z', now, 60 * 1000)).toBe(true);
        expect(is_heartbeat_fresh(null, now)).toBe(false);
        expect(is_heartbeat_fresh('yesterday-ish', now)).toBe(false);
    });
});

describe('reclaim / finish / abort — frontmatter-only rewrites (AC-008)', () => {
    it('reclaim re-stamps the lock + launch facts and preserves the agent-written body', () => {
        const original = `${build_run_content(FIELDS)}agent evidence line 1\nagent evidence line 2\n`;
        const reclaimed = reclaim_run_content(original, {
            ...FIELDS,
            worktree: '/repo/.worktrees/auth-2',
            branch: 'suspec/auth-2',
            baseSha: 'def456',
            pid: 9999,
            heartbeat: '2026-07-09T11:00:00.000Z',
        });
        const lock = read_run_lock(reclaimed);
        expect(lock).toEqual({
            status: 'live',
            pid: 9999,
            heartbeat: '2026-07-09T11:00:00.000Z',
            worktree: '/repo/.worktrees/auth-2',
            branch: 'suspec/auth-2',
        });
        expect(reclaimed).toContain('base_sha: def456');
        expect(reclaimed).toContain('agent evidence line 1\nagent evidence line 2\n');
    });

    it('reclaim with a null base_sha leaves the recorded one untouched', () => {
        const reclaimed = reclaim_run_content(build_run_content(FIELDS), { ...FIELDS, baseSha: null, pid: 1 });
        expect(reclaimed).toContain('base_sha: abc123');
        expect(read_run_lock(reclaimed).pid).toBe(1);
    });

    it('finish releases the lock (status exited) and records the exit as a fact', () => {
        const finished = finish_run_content(`${build_run_content(FIELDS)}body kept\n`, 3);
        expect(read_run_lock(finished).status).toBe('exited');
        expect(finished).toContain('exit: 3');
        expect(finished).toContain('body kept\n');
    });

    it('abort releases the lock so a failed launch never blocks the next work', () => {
        expect(read_run_lock(abort_run_content(build_run_content(FIELDS))).status).toBe('aborted');
    });
});
