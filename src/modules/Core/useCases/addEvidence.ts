// `suspec evidence add <RUN> --ac <AC> -- <command…>` — the engine (SPEC-suspec-v2 AC-010/012).
// The CLI runs the command ITSELF in the run's worktree (via the injected capture — the Workspace
// spawn edge), stores the raw output byte-exact in `evidence/<run>/<seq>-<slug>.out`, writes the
// `<seq>-<slug>.md` record (`provenance: cli-verified` + the capture block only this path writes
// + the AC-012 staleness digest of the worktree at capture), and appends one row to the run
// file's `## Evidence` table. The record is written for a PASSING and a FAILING command alike —
// the exit code is a fact, not a gate; the command mirrors it (0 → clean, non-zero → warning).
// Only a command that cannot execute at all, or a run that does not resolve, is an Err (exit 2).

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import {
    append_evidence_row,
    build_evidence_content,
    capture_sha256,
    evidence_slug,
    evidence_stem,
    next_evidence_seq,
} from '../services/evidenceArtifact.ts';
import { evidence_dir, run_filename } from '../services/storeLayout.ts';
import { read_run_state } from './readRunState.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

// The Workspace spawn edge, injected so the engine is testable without a real process: run argv in
// cwd, capture everything. An Err means the command could not execute at all (not a non-zero exit).
export type EvidenceCapture = (
    command: readonly string[],
    cwd: string
) => Result<{ exit: number; stdout: string; stderr: string }, AppError>;

export type AddEvidenceInput = Readonly<{
    storeDir: string;
    runSlug: string; // validated as a safe segment by the command
    ac: string;
    command: readonly string[];
    capture: EvidenceCapture;
    // The AC-012 staleness digest of a worktree's current state (Workspace git edge); null when it
    // cannot be computed — recorded as such and read stale at `done`.
    diffDigest: (worktreePath: string) => string | null;
    now?: () => Date;
}>;

export type AddEvidenceReport = Readonly<{
    level: OutcomeLevel;
    run: string;
    ac: string;
    command: string;
    exit: number;
    evidencePath: string;
    capturePath: string;
    provenance: 'cli-verified';
}>;

export function add_evidence(input: AddEvidenceInput): Result<AddEvidenceReport, AppError> {
    const runPath = join(input.storeDir, run_filename(input.runSlug));
    const run = read_run_state(runPath);
    if (run === null) {
        return err(usage_error(`no run ${input.runSlug} in the store (searched ${runPath})`));
    }
    const worktree = run.lock.worktree;
    if (worktree === null || !existsSync(worktree)) {
        return err(
            createAppError(
                'evidence_worktree_missing',
                `the run's worktree is gone (${worktree ?? 'none recorded'}) — relaunch with \`suspec work\` before capturing evidence`,
                { runSlug: input.runSlug, worktree }
            )
        );
    }

    // Capture FIRST: a command that cannot execute writes nothing.
    const captured = input.capture(input.command, worktree);
    if (isErr(captured)) {
        return err(captured.error);
    }
    const { exit, stdout, stderr } = captured.value;
    const raw = stdout + stderr;

    const dir = evidence_dir(input.storeDir, input.runSlug);
    let existingNames: string[];
    try {
        mkdirSync(dir, { recursive: true });
        existingNames = readdirSync(dir);
    } catch (cause) {
        // Something non-directory squats on the evidence path — an Err, never a crash.
        return err(createAppError('evidence_dir_unwritable', `could not open the evidence dir at ${dir}`, { dir }, cause));
    }
    const stem = evidence_stem(next_evidence_seq(existingNames), evidence_slug(input.command));
    const capturePath = join(dir, `${stem}.out`);
    const evidencePath = join(dir, `${stem}.md`);

    // The raw output first (byte-exact, non-markdown → no grammar stamp), then the record whose
    // capture block hashes it — so a crash between the two leaves an orphan .out, never a record
    // pointing at nothing.
    const rawWritten = write_store_artifact(capturePath, raw);
    if (isErr(rawWritten)) {
        return err(rawWritten.error);
    }
    const content = build_evidence_content({
        runSlug: input.runSlug,
        ac: input.ac,
        command: input.command,
        exit,
        worktree,
        capturedAt: (input.now ?? (() => new Date()))().toISOString(),
        worktreeDiffSha: input.diffDigest(worktree) ?? 'uncomputable',
        captureFile: `${stem}.out`,
        captureBytes: Buffer.byteLength(raw, 'utf8'),
        captureSha256: capture_sha256(raw),
    });
    const recordWritten = write_store_artifact(evidencePath, content);
    if (isErr(recordWritten)) {
        return err(recordWritten.error);
    }

    // The run file's evidence table gains one row (AC-010) — the agent-owned body is preserved.
    const appended = append_evidence_row(run.content, {
        stem,
        ac: input.ac,
        exit,
        provenance: 'cli-verified',
    });
    const runWritten = write_store_artifact(runPath, appended);
    if (isErr(runWritten)) {
        return err(runWritten.error);
    }

    return ok({
        level: exit === 0 ? 'clean' : 'warning',
        run: input.runSlug,
        ac: input.ac,
        command: input.command.join(' '),
        exit,
        evidencePath,
        capturePath,
        provenance: 'cli-verified',
    });
}
