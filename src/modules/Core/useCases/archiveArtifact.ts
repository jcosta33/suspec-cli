// Archiving (SPEC-suspec-v2 AC-002): a store artifact retires by moving — same filename, same
// bytes — into `archive/`, the only lifecycle subfolder, created on first use. Never a delete,
// never a rewrite: rename preserves content exactly. Refuses to clobber an already-archived
// namesake and refuses any filename that is not a single flat segment.

import { existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { archive_dir } from '../services/storeLayout.ts';

export function archive_artifact(storeDir: string, filename: string): Result<{ archivedPath: string }, AppError> {
    if (!is_safe_segment(filename)) {
        return err(
            createAppError('store_archive_invalid_filename', `Not a flat store filename: ${filename}`, { filename })
        );
    }
    const source = join(storeDir, filename);
    if (!existsSync(source)) {
        return err(createAppError('store_artifact_not_found', `No store artifact at ${source}`, { source }));
    }
    const target = join(archive_dir(storeDir), filename);
    if (existsSync(target)) {
        return err(
            createAppError('store_archive_collision', `An archived artifact already exists at ${target}`, { target })
        );
    }
    try {
        mkdirSync(archive_dir(storeDir), { recursive: true });
        renameSync(source, target);
    } catch (cause) {
        return err(createAppError('store_archive_failed', `Could not archive ${source}`, { source, target }, cause));
    }
    return ok({ archivedPath: target });
}
