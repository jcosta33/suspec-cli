// `suspec store gc` — the ONLY deleting store operation (SPEC-suspec-v2 AC-020). It deletes:
//   - inside `archive/`: an archived artifact older than the retention window (mtime; default 30
//     days, `retention_days` in suspec.config.json) is unlinked;
//   - crash turds: `.<name>.tmp-*` files (write_store_artifact's atomic-write temps, orphaned by
//     a crash between write and rename) older than ONE DAY, in the store root and `archive/`.
// Live artifacts, `evidence/`, and anything younger than its window are never touched — archiving
// stays doctor's job, and doctor never deletes. Returns exactly what died so the command prints it.

import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { archive_dir } from '../services/storeLayout.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

// write_store_artifact's temp naming: `.<target-basename>.tmp-<pid>-<hex>`.
const TMP_TURD = /^\..*\.tmp-/;

export type GcStoreInput = Readonly<{
    storeDir: string;
    retentionDays: number;
    now?: Date;
}>;

export type GcStoreReport = Readonly<{
    deleted: readonly Readonly<{ filename: string; ageDays: number }>[];
    // Orphaned atomic-write temps swept from the store root + archive (older than 1 day).
    sweptTmp: readonly string[];
}>;

// Unlink every `.<name>.tmp-*` file in `dir` older than one day. A temp younger than that may
// belong to a write in flight — left alone.
function sweep_tmp_turds(dir: string, nowMs: number, swept: string[]): Result<null, AppError> {
    if (!existsSync(dir)) {
        return ok(null);
    }
    const cutoff = nowMs - DAY_MS;
    for (const name of readdirSync(dir).sort()) {
        if (!TMP_TURD.test(name)) {
            continue;
        }
        const path = join(dir, name);
        let stat;
        try {
            stat = statSync(path);
            /* v8 ignore next 3 -- a race: the entry vanished between readdir and stat */
        } catch {
            continue;
        }
        if (!stat.isFile() || stat.mtimeMs >= cutoff) {
            continue;
        }
        try {
            unlinkSync(path);
        } catch (cause) {
            return err(createAppError('store_gc_failed', `could not delete ${path}`, { path }, cause));
        }
        swept.push(name);
    }
    return ok(null);
}

export function gc_store(input: GcStoreInput): Result<GcStoreReport, AppError> {
    const nowMs = (input.now ?? new Date()).getTime();
    const deleted: { filename: string; ageDays: number }[] = [];
    const sweptTmp: string[] = [];

    const archive = archive_dir(input.storeDir);
    if (existsSync(archive)) {
        const cutoff = nowMs - input.retentionDays * DAY_MS;
        for (const name of readdirSync(archive).sort()) {
            if (TMP_TURD.test(name)) {
                continue; // temps have their own 1-day sweep below
            }
            const path = join(archive, name);
            let stat;
            try {
                stat = statSync(path);
                /* v8 ignore next 3 -- a race: the entry vanished between readdir and stat */
            } catch {
                continue;
            }
            if (!stat.isFile()) {
                continue;
            }
            const mtimeMs = stat.mtimeMs;
            if (mtimeMs >= cutoff) {
                continue; // inside retention — untouchable
            }
            try {
                unlinkSync(path);
            } catch (cause) {
                return err(createAppError('store_gc_failed', `could not delete ${path}`, { path }, cause));
            }
            deleted.push({ filename: name, ageDays: Math.floor((nowMs - mtimeMs) / DAY_MS) });
        }
    }

    for (const dir of [input.storeDir, archive]) {
        const swept = sweep_tmp_turds(dir, nowMs, sweptTmp);
        if (isErr(swept)) {
            return err(swept.error);
        }
    }
    return ok({ deleted, sweptTmp });
}
