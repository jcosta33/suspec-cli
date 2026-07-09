// The runner launch edge for `suspec work` v2 (SPEC-suspec-v2 AC-009): spawn a RENDERED runner
// argv in the worktree. launch_adapter's spawn mechanics, kept for a multi-token command template:
// spawnSync with NO shell, stdio inherited (the human drives the agent in their own terminal), the
// exit recorded as data. A NON-ZERO agent exit is NOT an error — only a failure to launch the
// program at all (e.g. the binary is not installed) is an Err, which the command surfaces as its
// own exit 2.

import { spawnSync } from 'child_process';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';

export type RunnerLaunchError = AppError<'LaunchFailed', { command: string; detail: string }>;

export function launch_runner(
    argv: readonly string[],
    worktreePath: string
): Result<{ exit: number }, RunnerLaunchError> {
    const [bin, ...args] = argv;
    if (bin === undefined || bin.length === 0) {
        return err(
            createAppError('LaunchFailed', 'the runner command template rendered to an empty command', {
                command: '',
                detail: 'empty template',
            })
        );
    }
    const result = spawnSync(bin, args, { cwd: worktreePath, stdio: 'inherit' });
    if (result.error) {
        return err(
            createAppError(
                'LaunchFailed',
                `could not launch runner "${bin}": ${result.error.message}`,
                { command: bin, detail: result.error.message },
                result.error
            )
        );
    }
    // status is null when the program was terminated by a signal — recorded as a non-zero exit,
    // exactly like launch_adapter.
    return ok({ exit: result.status ?? 1 });
}
