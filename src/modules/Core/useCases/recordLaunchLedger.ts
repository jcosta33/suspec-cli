// Record a run launch in the CLI-owned capture ledger (see services/captureLedger.ts): the run
// slug bound to the driving spec's id AND content hash at launch. `done` cross-checks the run
// file's `spec:` and the spec's current content against the latest launch line — a run redirected
// to a different (or rewritten) spec after launch is a blocking lint, not a passing gate. A
// legitimate relaunch appends a fresh line; the latest one governs.

import { type Result } from '../../../infra/errors/result.ts';
import { type AppError } from '../../../infra/errors/createAppError.ts';
import { spec_content_sha256 } from '../services/captureLedger.ts';
import { append_capture_ledger_line } from './appendCaptureLedgerLine.ts';

export type RecordLaunchLedgerInput = Readonly<{
    storeDir: string;
    runSlug: string;
    specId: string;
    specSource: string; // the driving spec's full content at launch
    now?: () => Date;
}>;

export function record_launch_ledger(input: RecordLaunchLedgerInput): Result<{ path: string }, AppError> {
    return append_capture_ledger_line(input.storeDir, {
        kind: 'launch',
        run: input.runSlug,
        spec_id: input.specId,
        spec_sha256: spec_content_sha256(input.specSource),
        ts: (input.now ?? (() => new Date()))().toISOString(),
    });
}
