// Append ONE line to the CLI-owned capture ledger (see services/captureLedger.ts for the model
// and the honesty note). The fs edge: creates `<state-root>/.captures/` on first use and appends
// atomically enough for a single-writer CLI (appendFileSync with O_APPEND). Never rewrites.

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { build_ledger_line, capture_ledger_path, type CaptureLedgerEntry } from '../services/captureLedger.ts';

export function append_capture_ledger_line(
    storeDir: string,
    entry: CaptureLedgerEntry
): Result<{ path: string }, AppError> {
    const path = capture_ledger_path(storeDir);
    try {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, build_ledger_line(entry), 'utf8');
    } catch (cause) {
        return err(
            createAppError('capture_ledger_unwritable', `could not append to the capture ledger at ${path}`, { path }, cause)
        );
    }
    return ok({ path });
}
