// `suspec store purge` — delete the repo's WHOLE store dir (SPEC-suspec-v2 AC-020). The
// confirmation ceremony (type the repo name, or --force; refuse outside a TTY) lives in the
// command face — this engine only performs the removal it was explicitly asked for. The store is
// per-repo state, so a purge is always recoverable-by-rework, never repo-destructive.

import { existsSync, rmSync } from 'fs';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';

export function purge_store(storeDir: string): Result<{ removed: string }, AppError> {
    if (!existsSync(storeDir)) {
        return ok({ removed: storeDir }); // already gone — purging twice is not an error
    }
    try {
        rmSync(storeDir, { recursive: true, force: true });
    } catch (cause) {
        return err(createAppError('store_purge_failed', `could not delete the store at ${storeDir}`, {}, cause));
    }
    return ok({ removed: storeDir });
}
