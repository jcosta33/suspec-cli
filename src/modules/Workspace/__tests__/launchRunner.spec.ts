import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { launch_runner } from '../useCases/launchRunner.ts';

// SPEC-suspec-v2 AC-009: the rendered-argv runner spawn — launch_adapter's mechanics (no shell,
// cwd = worktree, exit recorded as data; only an unlaunchable program is an error).

let dir: string;
beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-runner-')));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('launch_runner (AC-009)', () => {
    it('spawns the argv in the worktree cwd, passing every rendered token as its own argument', () => {
        const stub = join(dir, 'stub.sh');
        writeFileSync(stub, `#!/bin/sh\npwd -P > out.txt\nprintf '%s|%s' "$1" "$2" >> out.txt\nexit 0\n`);
        chmodSync(stub, 0o755);
        const result = assertOk(launch_runner([stub, '--flag=x y', 'multi\nline prompt'], dir));
        expect(result.exit).toBe(0);
        expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe(`${dir}\n--flag=x y|multi\nline prompt`);
    });

    it('records a non-zero agent exit as DATA, not an error', () => {
        const stub = join(dir, 'fail.sh');
        writeFileSync(stub, `#!/bin/sh\nexit 3\n`);
        chmodSync(stub, 0o755);
        const result = launch_runner([stub], dir);
        expect(isErr(result)).toBe(false);
        expect(assertOk(result).exit).toBe(3);
    });

    it('errors (LaunchFailed) when the program cannot be launched, and on an empty argv', () => {
        const missing = assertErr(launch_runner(['/nonexistent/suspec-runner-xyz'], dir));
        expect(missing._tag).toBe('LaunchFailed');
        expect(missing.message).toMatch(/could not launch runner/);
        expect(assertErr(launch_runner([], dir)).message).toMatch(/empty command/);
        expect(assertErr(launch_runner([''], dir))._tag).toBe('LaunchFailed');
    });
});
