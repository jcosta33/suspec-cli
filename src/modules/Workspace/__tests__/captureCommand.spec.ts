import { describe, it, expect } from 'vitest';
import { mkdtempSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { capture_command } from '../useCases/captureCommand.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

// SPEC-suspec-v2 AC-010: the evidence-capture spawn — a bare binary + args, no shell, exit and
// both streams captured AS BUFFERS (the byte-exact store claim). Real spawns against `node`, so
// the edge itself is exercised.

describe('capture_command', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-cap-')));

    it('captures exit 0 + stdout (as bytes) of a passing command, run in the given cwd', () => {
        const result = assertOk(
            capture_command(['node', '-e', 'console.log("out:" + process.cwd())'], cwd)
        );
        expect(result.exit).toBe(0);
        expect(Buffer.isBuffer(result.stdout)).toBe(true);
        expect(result.stdout.toString('utf8')).toContain(`out:${cwd}`);
        expect(result.stderr.toString('utf8')).toBe('');
    });

    it('captures a non-zero exit + stderr as a RESULT, not an Err', () => {
        const result = assertOk(capture_command(['node', '-e', 'console.error("boom"); process.exit(3)'], cwd));
        expect(result.exit).toBe(3);
        expect(result.stderr.toString('utf8')).toContain('boom');
    });

    it('is an Err for an empty argv and for a binary that does not exist', () => {
        expect(assertErr(capture_command([], cwd))._tag).toBe('capture_empty_command');
        const error = assertErr(capture_command(['suspec-no-such-binary-xyz'], cwd));
        expect(error._tag).toBe('capture_spawn_failed');
        expect(error.message).toContain('no shell');
    });

    it('distinguishes an output overflow (ran, too big) from a missing binary in the message', () => {
        // A tiny maxBuffer is not injectable here by design (the constant is the contract), so
        // exercise the real 64 MiB ceiling cheaply: emit >64 MiB of zeros from node itself.
        const error = assertErr(
            capture_command(
                ['node', '-e', 'const b=Buffer.alloc(1024*1024,46);for(let i=0;i<65;i++)process.stdout.write(b)'],
                cwd
            )
        );
        expect(error._tag).toBe('capture_spawn_failed');
        expect(error.message).toContain('output exceeded');
        expect(error.message).not.toContain('must be on PATH');
    });
});
