// The evidence-capture spawn (SPEC-suspec-v2 AC-010): run one command — a bare `binary arg arg`,
// NO shell, like run_setup/launch_runner — in the run's worktree and capture exit + stdout +
// stderr for the store. The single impure edge `suspec evidence add` injects into the Core
// engine. A non-zero exit is a RESULT (the record is written either way); only a command that
// cannot execute at all (missing binary, empty argv) is an Err.

import { spawnSync } from 'child_process';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

// Node's spawnSync default maxBuffer is 1 MiB — a real verify command (a full test run with
// coverage) easily exceeds it, which would make its evidence UNCAPTURABLE. 64 MiB gives honest
// headroom; the overflow case below still gets its own message when even that is exceeded.
const CAPTURE_MAX_BUFFER = 64 * 1024 * 1024;

// Output stays BUFFERS end to end: the .out capture is advertised as byte-exact, so no
// encode/decode round-trip may sit between the child process and the stored file.
export type CapturedCommand = Readonly<{ exit: number; stdout: Buffer; stderr: Buffer }>;

// spawnSync surfaces a maxBuffer overflow as an error with one of these codes (platform/Node
// version dependent) — a command that RAN but out-talked the buffer, not a missing binary.
function is_overflow(error: NodeJS.ErrnoException): boolean {
    return error.code === 'ENOBUFS' || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
}

export function capture_command(command: readonly string[], cwd: string): Result<CapturedCommand, AppError> {
    if (command.length === 0) {
        return err(createAppError('capture_empty_command', 'no command to capture', {}));
    }
    const result = spawnSync(command[0], command.slice(1), { cwd, maxBuffer: CAPTURE_MAX_BUFFER });
    if (result.error) {
        // Distinguish the failure honestly: an output overflow means the command executed but its
        // output could not be captured whole; anything else is the command not executing at all.
        const message = is_overflow(result.error)
            ? `${command[0]} ran but its output exceeded the ${CAPTURE_MAX_BUFFER / (1024 * 1024)} MiB capture buffer — nothing recorded; capture a quieter command instead`
            : `could not execute ${command[0]}: ${result.error.message} (the program must be on PATH — evidence capture runs a bare command, no shell)`;
        return err(createAppError('capture_spawn_failed', message, { command: command.join(' ') }, result.error));
    }
    return ok({
        exit: result.status ?? 1,
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr ?? Buffer.alloc(0),
    });
}
