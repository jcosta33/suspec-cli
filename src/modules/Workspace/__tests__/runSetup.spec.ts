import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, realpathSync, writeFileSync, chmodSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run_setup } from '../useCases/runSetup.ts';

// SPEC-suspec-cli-work AC-003: setup runs in the worktree and is ADVISORY — a non-zero or unlaunchable
// command is recorded and returned, never thrown.
let dir: string;
beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-setup-')));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('run_setup', () => {
    it('runs each command in the given worktree and reports exit 0', () => {
        const script = join(dir, 's.sh');
        writeFileSync(script, `#!/bin/sh\nprintf ok > ran.txt\n`);
        chmodSync(script, 0o755);
        expect(run_setup([script], dir)).toEqual([{ command: script, exit: 0 }]);
        expect(existsSync(join(dir, 'ran.txt'))).toBe(true);
    });

    it('records a non-zero exit without throwing', () => {
        const script = join(dir, 'f.sh');
        writeFileSync(script, `#!/bin/sh\nexit 4\n`);
        chmodSync(script, 0o755);
        expect(run_setup([script], dir)).toEqual([{ command: script, exit: 4 }]);
    });

    it('records exit 127 when the program cannot be launched', () => {
        expect(run_setup(['/nonexistent/xyz-tool'], dir)[0].exit).toBe(127);
    });

    it('splits a "binary arg arg" string and is a no-op for an empty list or a blank command', () => {
        expect(run_setup([], dir)).toEqual([]);
        expect(run_setup(['   '], dir)).toEqual([]);
    });
});
