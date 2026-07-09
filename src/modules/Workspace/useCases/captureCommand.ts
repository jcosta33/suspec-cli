// The evidence-capture spawn (SPEC-suspec-v2 AC-010): run one command — a bare `binary arg arg`,
// NO shell, like run_setup/launch_runner — in the run's worktree and capture exit + stdout +
// stderr for the store. The single impure edge `suspec evidence add` injects into the Core
// engine. A non-zero exit is a RESULT (the record is written either way); only a command that
// cannot execute at all (missing binary, empty argv) is an Err.

import { spawnSync } from 'child_process';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type CapturedCommand = Readonly<{ exit: number; stdout: string; stderr: string }>;

export function capture_command(command: readonly string[], cwd: string): Result<CapturedCommand, AppError> {
    if (command.length === 0) {
        return err(createAppError('capture_empty_command', 'no command to capture', {}));
    }
    const result = spawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8' });
    if (result.error) {
        return err(
            createAppError(
                'capture_spawn_failed',
                `could not execute ${command[0]}: ${result.error.message} (the program must be on PATH — evidence capture runs a bare command, no shell)`,
                { command: command.join(' ') },
                result.error
            )
        );
    }
    return ok({ exit: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' });
}
