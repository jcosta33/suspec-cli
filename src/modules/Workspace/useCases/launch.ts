// The launch edge for `suspec run` (SPEC-suspec-cli-run): spawn the configured agent program in the
// task's worktree, and write the launch-envelope run record under the code repo's `.suspec/work/`. Both
// impure actions live here in the Workspace leaf beside the git/file edges, so the command stays thin
// and the no-board-write invariant has one place to scan. `suspec run` never *becomes* the agent — it
// launches the program, inherits the terminal, waits, and records the exit (D2: interactive, not
// headless-captured).

import { spawnSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';

export type LaunchError = AppError<'LaunchFailed', { command: string; detail: string }>;

// The delegation-provenance block (ADR-0088): the trace fields `suspec run` knows when it launches a
// worker — a record, never a verdict (ADR-0077 Decision 8). The contract's fuller fields (the worker's
// inputs/filtered-context/tools/evidence) come from the in-session SubagentStart/Stop hook producer,
// not this interactive launcher, which sees only what it launched and how it exited.
export type RunProvenance = Readonly<{
    worker: string; // the adapter/worker launched
    reason: string; // the task it was delegated
    isolation: 'worktree'; // `suspec run` always launches in the task's git worktree
    could_edit: boolean; // the launched agent can write in the worktree (interactive, unrestricted)
    exit: number; // the worker's exit, recorded as a fact
}>;

// The launch run record (AC-004 / ADR-0088): the facts `suspec review` reads as the recorded start
// point, plus the delegation-provenance block and the changed-files snapshot (ADR-0088 producer 1).
// `changed_files` is the worktree diff after the agent exits (committed-since-base ∪ uncommitted);
// `commands[]` (the agent's own commands) stays a deferred milestone (D1). Both new fields are additive
// and optional, so a record written before them stays valid.
export type RunRecord = Readonly<{
    task_id: string;
    adapter: string;
    worktree: string;
    branch: string | null;
    source: string | null;
    exit: number;
    changed_files?: readonly string[];
    provenance?: RunProvenance;
}>;

/**
 * Launch the adapter program in the worktree and wait for it. The startup instruction (when present)
 * is delivered as the program's first argument — the M1 convention for a shell-launchable agent CLI
 * (`claude "<instruction>"`). stdio is inherited so the human drives the agent in their own terminal.
 *
 * A NON-ZERO agent exit is NOT an error — the agent ran; its exit is recorded data. Only a failure to
 * launch the program at all (e.g. the command is not installed) is an `Err('LaunchFailed')`, so the
 * command can surface it as exit 2 rather than a stack trace.
 */
export function launch_adapter(
    command: string,
    startupInstruction: string,
    worktreePath: string
): Result<{ exit: number }, LaunchError> {
    const args = startupInstruction.length > 0 ? [startupInstruction] : [];
    const result = spawnSync(command, args, { cwd: worktreePath, stdio: 'inherit' });
    if (result.error) {
        // #91c: a multi-word command is the common mistake — spawnSync looks up the whole string as
        // ONE executable, so `node --watch` fails ENOENT. The adapter command is a bare binary in PATH.
        const shellStringHint = command.includes(' ')
            ? ` — the adapter \`command\` is a single binary in PATH (e.g. \`claude\`), not a shell string; "${command}" was looked up as one executable`
            : '';
        return err(
            createAppError(
                'LaunchFailed',
                `could not launch agent "${command}": ${result.error.message}${shellStringHint}`,
                { command, detail: result.error.message },
                result.error
            )
        );
    }
    // status is null when the program was terminated by a signal — treat that as a non-zero exit. M1
    // records only the numeric exit; preserving the signal cause is deferred with the rest of the
    // run-record field set (the spec's open question on the deferred-normalization milestone).
    return ok({ exit: result.status ?? 1 });
}

// A filesystem-safe stem for the run-record filename: the task id minus a leading `TASK-`, lower-cased,
// with every character outside `[a-z0-9._-]` collapsed to `-`. `/` (and any separator) can never
// survive, so the write stays inside `.suspec/work/` — that is the load-bearing safety property. (A
// literal `..` could still appear as a filename component, e.g. from a `..`-laden id, but never as a
// path separator; and two ids differing only in case collapse to one file. The record's own `task_id`
// field preserves the exact id, so a collision overwrites with a correctly-labelled record.)
function record_stem(taskId: string): string {
    return taskId
        .replace(/^TASK-/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-');
}

/**
 * Write the run record under `<repoRoot>/.suspec/work/<task>.json` — gitignored scratch in the CODE
 * repo, not a committed workspace artifact. Overwrite-by-design: each launch replaces the task's record
 * (unlike the no-clobber workspace writer). Never writes the workspace board or any workspace path.
 */
export function write_run_record(repoRoot: string, record: RunRecord): { path: string } {
    const dir = join(repoRoot, '.suspec', 'work');
    const path = join(dir, `${record_stem(record.task_id)}.json`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
    return { path };
}
