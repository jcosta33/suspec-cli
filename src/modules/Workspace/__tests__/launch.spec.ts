import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';

import { launch_adapter } from '../useCases/launch.ts';
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
