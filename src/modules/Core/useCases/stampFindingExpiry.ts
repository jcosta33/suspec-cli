// Stamp an expiry date into a finding's frontmatter (SPEC-suspec-v2 AC-015) — the `keep` triage
// choice, and the automatic defer for untriaged findings in non-interactive `done`. The finding
// stays in the store, now carrying `expires: <date>` (default +30 days) so the decay surface
// (AC-019, a later wave) can age it out. The body is preserved byte-for-byte; the write is atomic.

import { readFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { upsert_frontmatter } from '../services/readFrontmatter.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

export const FINDING_EXPIRY_DAYS = 30;

export type StampFindingExpiryInput = Readonly<{
    storeDir: string;
    filename: string; // the flat store basename (listed by list_open_findings — never a raw path)
    now?: () => Date;
    days?: number;
}>;

// The stamped date, ISO date-only (`2026-08-08`): +N days from now, day precision is plenty.
export function expiry_date(now: Date, days: number = FINDING_EXPIRY_DAYS): string {
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function stamp_finding_expiry(input: StampFindingExpiryInput): Result<{ expires: string }, AppError> {
    const path = join(input.storeDir, input.filename);
    let source: string;
    try {
        source = readFileSync(path, 'utf8');
    } catch (cause) {
        return err(createAppError('finding_unreadable', `could not read the finding at ${path}`, { path }, cause));
    }
    const expires = expiry_date((input.now ?? (() => new Date()))(), input.days);
    const written = write_store_artifact(path, upsert_frontmatter(source, { expires }));
    if (isErr(written)) {
        return err(written.error);
    }
    return ok({ expires });
}
