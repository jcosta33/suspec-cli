// `suspec store gc` — the ONLY deleting store operation (SPEC-suspec-v2 AC-020), and it deletes
// ONLY inside `archive/`: an archived artifact older than the retention window (mtime; default 30
// days, `retention_days` in suspec.config.json) is unlinked. The store root, `evidence/`, and
// anything younger than retention are never touched — archiving stays doctor's job, and doctor
// never deletes. Returns exactly what died so the command prints it.

import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { archive_dir } from '../services/storeLayout.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type GcStoreInput = Readonly<{
    storeDir: string;
    retentionDays: number;
    now?: Date;
}>;

export type GcStoreReport = Readonly<{
    deleted: readonly Readonly<{ filename: string; ageDays: number }>[];
}>;

export function gc_store(input: GcStoreInput): Result<GcStoreReport, AppError> {
    const archive = archive_dir(input.storeDir);
    if (!existsSync(archive)) {
        return ok({ deleted: [] });
    }
    const nowMs = (input.now ?? new Date()).getTime();
    const cutoff = nowMs - input.retentionDays * DAY_MS;
    const deleted: { filename: string; ageDays: number }[] = [];
    for (const name of readdirSync(archive).sort()) {
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
    return ok({ deleted });
}
