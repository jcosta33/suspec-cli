import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { read_run_state } from '../readRunState.ts';

// SPEC-suspec-v2 AC-008: the read half of the run lock — content + parsed lock; a missing or
// unreadable run file reads as NO state (a lock that cannot be read never blocks a launch).

let dir: string;
beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-runstate-')));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('read_run_state (AC-008)', () => {
    it('reads the content and the lock fields of an existing run file', () => {
        const path = join(dir, 'run-auth.md');
        const content = `---\ntype: run\nspec: SPEC-auth\nworktree: /wt\nbranch: suspec/auth\nstatus: live\npid: 7\nheartbeat: 2026-07-09T10:00:00.000Z\n---\n\nbody\n`;
        writeFileSync(path, content);
        expect(read_run_state(path)).toEqual({
            path,
            content,
            lock: { status: 'live', pid: 7, heartbeat: '2026-07-09T10:00:00.000Z', worktree: '/wt', branch: 'suspec/auth' },
        });
    });

    it('returns null for a missing file and for an unreadable path (a directory)', () => {
        expect(read_run_state(join(dir, 'run-none.md'))).toBeNull();
        mkdirSync(join(dir, 'run-dir.md'));
        expect(read_run_state(join(dir, 'run-dir.md'))).toBeNull();
    });
});
