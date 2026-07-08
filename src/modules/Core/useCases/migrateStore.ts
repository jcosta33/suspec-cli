// `suspec store migrate` scaffold (SPEC-suspec-v2 AC-003) — the ONLY function allowed to rewrite
// artifacts it did not just create. It reads every flat markdown artifact in the store root and
// `archive/`, and upgrades any grammar older than current by walking the per-version transform
// table (`GRAMMAR_MIGRATIONS[n]`: n → n+1 — empty today, version 1 is the first grammar); a gap in
// the chain is a refusal, never a guess. An artifact with no recorded version reads as grammar 1
// and gets the version stamped. Artifacts already at the current version are untouched (no-op);
// newer-than-current versions are reported, never downgraded. Rewrites go through the atomic writer.

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import {
    CURRENT_GRAMMAR_VERSION,
    GRAMMAR_MIGRATIONS,
    read_grammar_version,
    stamp_grammar_version,
    type GrammarTransform,
} from '../services/grammarVersion.ts';
import { archive_dir } from '../services/storeLayout.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

export type MigrateStoreInput = Readonly<{
    storeDir: string;
    // Injectable so upgrade paths are testable while only grammar 1 exists; defaults to the real
    // version + table.
    currentVersion?: number;
    transforms?: Readonly<Record<number, GrammarTransform>>;
}>;

export type MigrateStoreReport = Readonly<{
    upgraded: readonly string[]; // rewritten to the current grammar
    current: readonly string[]; // already current — byte-untouched
    newer: readonly string[]; // ahead of this CLI — left alone
}>;

// The flat markdown artifacts directly inside one directory — never a recursive walk: the store
// has no other subtree to visit (evidence payloads are not grammar-versioned artifacts).
function list_artifacts(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => join(dir, entry.name));
}

export function migrate_store(input: MigrateStoreInput): Result<MigrateStoreReport, AppError> {
    const currentVersion = input.currentVersion ?? CURRENT_GRAMMAR_VERSION;
    const transforms = input.transforms ?? GRAMMAR_MIGRATIONS;
    if (!existsSync(input.storeDir)) {
        return err(createAppError('store_missing', `No store dir at ${input.storeDir}`, { storeDir: input.storeDir }));
    }
    const archived = archive_dir(input.storeDir);
    const paths = [...list_artifacts(input.storeDir), ...(existsSync(archived) ? list_artifacts(archived) : [])];

    const upgraded: string[] = [];
    const atCurrent: string[] = [];
    const newer: string[] = [];
    for (const path of paths) {
        let content: string;
        try {
            content = readFileSync(path, 'utf8');
        } catch (cause) {
            return err(createAppError('store_artifact_unreadable', `Could not read ${path}`, { path }, cause));
        }
        const recorded = read_grammar_version(content);
        const version = recorded ?? 1; // pre-versioned artifacts read as the first grammar
        if (version > currentVersion) {
            newer.push(path);
            continue;
        }
        if (version === currentVersion && recorded !== null) {
            atCurrent.push(path);
            continue;
        }
        let migrated = content;
        for (let from = version; from < currentVersion; from += 1) {
            const transform = transforms[from];
            if (transform === undefined) {
                return err(
                    createAppError(
                        'store_migrate_gap',
                        `No transform from grammar ${from} to ${from + 1} for ${path}`,
                        { path, from }
                    )
                );
            }
            migrated = transform(migrated);
        }
        const written = write_store_artifact(path, stamp_grammar_version(migrated, currentVersion));
        if (isErr(written)) {
            return err(written.error);
        }
        upgraded.push(path);
    }
    return ok({ upgraded, current: atCurrent, newer });
}
