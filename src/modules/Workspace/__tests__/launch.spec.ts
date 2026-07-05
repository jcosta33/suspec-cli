import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, realpathSync, readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, basename } from 'path';

import { launch_adapter, write_prompt_scratch } from '../useCases/launch.ts';
import { isErr } from '../../../infra/errors/result.ts';

describe('launch_adapter — LaunchFailed messaging (#91c)', () => {
    it('a multi-word command that fails to launch gets the bare-binary hint', () => {
        const result = launch_adapter('no-such-agent --watch extra', '', tmpdir());
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).toContain('single binary in PATH');
            expect(result.error.message).toContain('not a shell string');
        }
    });

    it('a single-word command that fails to launch gets no shell-string hint', () => {
        const result = launch_adapter('no-such-agent-binary-xyz', '', tmpdir());
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error.message).not.toContain('single binary in PATH');
        }
    });
});

// SPEC-suspec-cli-work AC-004: the generated prompt is written to gitignored scratch beside the run
// record, keyed by the driving artifact id via the same record_stem confinement.
describe('write_prompt_scratch', () => {
    let dir: string;
    const setup = (): string => (dir = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-prompt-'))));
    const teardown = (): void => rmSync(dir, { recursive: true, force: true });

    it('writes the prompt to .suspec/work/<stem>.prompt.md, appending a trailing newline', () => {
        setup();
        try {
            const { path, sha256 } = write_prompt_scratch(dir, 'SPEC-feat', 'do the thing');
            expect(path).toBe(join(dir, '.suspec', 'work', 'spec-feat.prompt.md'));
            expect(readFileSync(path, 'utf8')).toBe('do the thing\n');
            // The returned sha256 attests to the exact bytes written (including the appended newline).
            expect(sha256).toBe(createHash('sha256').update('do the thing\n').digest('hex'));
        } finally {
            teardown();
        }
    });

    it('keeps a single trailing newline when the prompt already ends in one', () => {
        setup();
        try {
            const { path } = write_prompt_scratch(dir, 'SPEC-feat', 'already\n');
            expect(readFileSync(path, 'utf8')).toBe('already\n');
        } finally {
            teardown();
        }
    });

    it('confines the filename via the shared record_stem sanitizer — no separator survives', () => {
        setup();
        try {
            const { path } = write_prompt_scratch(dir, 'SPEC/../evil', 'x');
            expect(basename(path)).toBe('spec-..-evil.prompt.md');
            expect(existsSync(join(dir, '.suspec', 'work'))).toBe(true);
        } finally {
            teardown();
        }
    });
});
