// The Unix-part contract util (AC-001/AC-002). Every M1 command routes its result through
// `project`, so the output/exit convention lives in exactly one place instead of being restated
// per command:
//   - machine data → stdout (JSON under `--json`), human-rendered result → stdout otherwise;
//   - progress/notes and error messages → stderr, always;
//   - exit code: 0 clean · 1 warnings/soft-fail · 2 hard error OR usage/runtime error.
// A hard error is either a blocking outcome an engine returns as a success value (e.g. a spec with
// a blocking check failure → exit 2) or an `Err` (bad usage, missing workspace, I/O failure → exit
// 2). Both collapse to 2 — the human/JSON message distinguishes them.

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { isErr, type Result } from '../../../infra/errors/result.ts';

// The three exit classes an engine success can carry. `Err` always maps to 2 regardless.
export type OutcomeLevel = 'clean' | 'warning' | 'blocking';

export type ExitCode = 0 | 1 | 2;

// Where `project` writes. Injected so the contract is testable without spawning a process; the
// default writers are the only impure edge.
export type OutputWriters = Readonly<{
    out: (text: string) => void;
    err: (text: string) => void;
}>;

const default_writers: OutputWriters = {
    out: (text) => {
        process.stdout.write(text);
    },
    err: (text) => {
        process.stderr.write(text);
    },
};

export function exit_code_for(level: OutcomeLevel): ExitCode {
    if (level === 'clean') {
        return 0;
    }
    if (level === 'warning') {
        return 1;
    }
    return 2;
}

// An engine success value must declare its level so `project` can map it to an exit code without
// re-inspecting the payload.
export type ProjectInput<TValue extends { readonly level: OutcomeLevel }> = Readonly<{
    result: Result<TValue, AppError>;
    json: boolean;
    render: (value: TValue) => string;
    // Optional progress/notes routed to stderr in both modes (never pollutes stdout data).
    notes?: readonly string[];
}>;

// Emit an AppError uniformly — message to stderr, a machine error object to stdout under --json,
// exit 2. Used by project's error arm and by commands for non-engine errors (bad usage, no git
// repo) that are not an engine Result.
export function emit_error(error: AppError, json: boolean, writers: OutputWriters = default_writers): ExitCode {
    writers.err(`${error.message}\n`);
    if (json) {
        writers.out(`${JSON.stringify({ error: error._tag, message: error.message })}\n`);
    }
    return 2;
}

export function project<TValue extends { readonly level: OutcomeLevel }>(
    input: ProjectInput<TValue>,
    writers: OutputWriters = default_writers
): ExitCode {
    for (const note of input.notes ?? []) {
        writers.err(`${note}\n`);
    }

    if (isErr(input.result)) {
        return emit_error(input.result.error, input.json, writers);
    }

    const { value } = input.result;
    if (input.json) {
        writers.out(`${JSON.stringify(value)}\n`);
    } else {
        writers.out(`${input.render(value)}\n`);
    }
    return exit_code_for(value.level);
}

// A malformed invocation (unknown subcommand, missing required argument) — also exit 2 (AC-001).
export function usage_error(message: string): AppError<'Usage'> {
    return createAppError('Usage', message);
}
