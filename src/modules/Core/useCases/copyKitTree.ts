// The conflict-safe kit copy engine behind `suspec update --write` (SPEC-suspec-update AC-008,
// ADR-0091/0135). Copies the kit-owned paths (the manifest's `kit_owned` prefixes — templates and
// friends) into a target dir WITHOUT ever destroying the user's content silently: each kit file is
// new (write), identical (no-op — a re-run is idempotent), or a conflict handled per policy (skip /
// overwrite / backup to `*.suspec-bak`). `.gitignore` merges a delimited marker block, and the
// kit's VERSION stamps `.agents/.suspec-version` so the drift check has an anchor. `suspec init`
// does NOT use this — init seeds (seed_repo, AC-024); only the kit refresh copies files in.

import {
    readdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    renameSync,
    copyFileSync,
    lstatSync,
    symlinkSync,
    readlinkSync,
    unlinkSync,
    type Stats,
} from 'fs';
import { join, relative, dirname } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { merge_marker_block } from '../services/markerBlock.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type ConflictPolicy = 'skip' | 'overwrite' | 'backup';

export type CopyKitTreeReport = Readonly<{
    level: OutcomeLevel;
    written: readonly string[];
    skipped: readonly string[];
    merged: readonly string[];
    backedUp: readonly string[];
    overwritten: readonly string[];
}>;

export type CopyKitTreeInput = Readonly<{
    sourceDir: string;
    targetDir: string;
    policy: ConflictPolicy;
    // The kit-tree filter: only kit files whose relative path passes it are copied. `suspec update
    // --write` passes the manifest's kit-owned prefixes so a refresh never touches the adopter's
    // own files. Absent → the whole tree. `.gitignore` always merges and the pin always re-stamps.
    pathFilter?: (rel: string) => boolean;
}>;

const GITIGNORE_START = '# >>> suspec >>>';
const GITIGNORE_END = '# <<< suspec <<<';
// Fallback ignores when a kit source ships no `.gitignore.additions`. `.worktrees/` is the
// load-bearing one: committing an in-repo worktree stages an embedded gitlink (SW-002).
const GITIGNORE_FALLBACK = '.worktrees/\n.suspec-cache/\n*.suspec-bak\n*.suspec-bak.*';

function walk_files(dir: string, base: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === '.git') {
            continue;
        }
        const full = join(dir, entry);
        if (lstatSync(full).isDirectory()) {
            out.push(...walk_files(full, base));
        } else {
            out.push(relative(base, full));
        }
    }
    return out;
}

function write_file(dst: string, content: string): void {
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, content);
}

// Stamp the kit's provenance version into the target (ADR-0081): record which kit version the
// copied content came from, so the drift compare has an anchor. Best-effort — a kit without a
// VERSION file stamps nothing. The pin is tooling metadata the tool owns, so a re-run re-stamps the
// current version unconditionally (not conflict-handled like user content).
function stamp_version(input: CopyKitTreeInput, written: string[]): void {
    const versionSource = join(input.sourceDir, 'VERSION');
    if (!existsSync(versionSource)) {
        return;
    }
    const version = readFileSync(versionSource, 'utf8').trim();
    if (version.length === 0) {
        return;
    }
    const stampDir = join(input.targetDir, '.agents');
    mkdirSync(stampDir, { recursive: true });
    writeFileSync(join(stampDir, '.suspec-version'), `${version}\n`);
    written.push('.agents/.suspec-version');
}

export function copy_kit_tree(input: CopyKitTreeInput): Result<CopyKitTreeReport, AppError> {
    if (!existsSync(input.sourceDir)) {
        return err(
            createAppError('kit_source_missing', `kit source not found: ${input.sourceDir}`, {
                source: input.sourceDir,
            })
        );
    }

    const written: string[] = [];
    const skipped: string[] = [];
    const merged: string[] = [];
    const backedUp: string[] = [];
    const overwritten: string[] = [];

    // Any filesystem write can fail (a read-only target, a permission boundary). Route those through
    // the Result channel as a clean error rather than letting an EACCES/EISDIR stack trace escape
    // (and break a `--json` consumer). A partial copy may be left behind — re-run is conflict-safe.
    try {
        // `.gitignore` always merges the kit's required ignores (idempotent marker block).
        merge_gitignore(input, merged, written);
        for (const rel of walk_files(input.sourceDir, input.sourceDir)) {
            if (rel === '.gitignore' || rel === '.gitignore.additions') {
                continue;
            }
            if (input.pathFilter !== undefined && !input.pathFilter(rel)) {
                continue;
            }
            copy_plain(input, rel, { written, skipped, backedUp, overwritten });
        }
        stamp_version(input, written);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return err(
            createAppError('kit_copy_failed', `could not copy the kit content into ${input.targetDir}: ${reason}`, {
                target: input.targetDir,
            })
        );
    }

    return ok({
        level: skipped.length > 0 ? 'warning' : 'clean',
        written,
        skipped,
        merged,
        backedUp,
        overwritten,
    });
}

function merge_gitignore(input: CopyKitTreeInput, merged: string[], written: string[]): void {
    const additionsPath = join(input.sourceDir, '.gitignore.additions');
    const block = existsSync(additionsPath) ? readFileSync(additionsPath, 'utf8') : GITIGNORE_FALLBACK;
    const target = join(input.targetDir, '.gitignore');
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const next = merge_marker_block({ existing, block, startMarker: GITIGNORE_START, endMarker: GITIGNORE_END });
    if (next === existing) {
        return;
    }
    write_file(target, next);
    (existing.length > 0 ? merged : written).push('.gitignore');
}

type PlainBuckets = { written: string[]; skipped: string[]; backedUp: string[]; overwritten: string[] };

// A non-clobbering backup name: `.suspec-bak`, then `.suspec-bak.1`, … so a second --backup run never
// destroys the first backup.
function free_backup_path(dst: string): string {
    let candidate = `${dst}.suspec-bak`;
    let suffix = 1;
    while (existsSync(candidate)) {
        candidate = `${dst}.suspec-bak.${suffix}`;
        suffix += 1;
    }
    return candidate;
}

// The destination entry as seen WITHOUT following a link — null when nothing is there. `existsSync`
// follows symlinks, so it reports a DANGLING link as absent; copying then writes THROUGH the broken
// link to its (possibly out-of-tree) target and silently loses the user's link. `lstat` sees the
// link itself, so a dangling dest is correctly detected as present-and-a-conflict.
function dst_entry(dst: string): Stats | null {
    try {
        return lstatSync(dst);
    } catch {
        return null; // ENOENT — truly absent
    }
}

function copy_plain(input: CopyKitTreeInput, rel: string, buckets: PlainBuckets): void {
    const src = join(input.sourceDir, rel);
    const dst = join(input.targetDir, rel);
    const existing = dst_entry(dst);

    if (lstatSync(src).isSymbolicLink()) {
        // Only create the link when nothing (not even a dangling link) is already there — never
        // symlinkSync over an existing entry (it throws EEXIST). An existing dest is left as-is.
        if (existing === null) {
            mkdirSync(dirname(dst), { recursive: true });
            symlinkSync(readlinkSync(src), dst);
            buckets.written.push(rel);
        }
        return;
    }

    if (existing === null) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        buckets.written.push(rel);
        return;
    }

    // A destination symlink (live OR dangling) is a conflict on the LINK — never copy through it (that
    // would follow the link and clobber its target, which may live outside the tree). Operate on
    // the link itself.
    if (existing.isSymbolicLink()) {
        if (input.policy === 'overwrite') {
            unlinkSync(dst);
            copyFileSync(src, dst);
            buckets.overwritten.push(rel);
        } else if (input.policy === 'backup') {
            renameSync(dst, free_backup_path(dst));
            copyFileSync(src, dst);
            buckets.backedUp.push(rel);
        } else {
            buckets.skipped.push(rel);
        }
        return;
    }

    if (readFileSync(src, 'utf8') === readFileSync(dst, 'utf8')) {
        return; // identical — idempotent no-op
    }

    // A genuine conflict: the user already has a different file here.
    if (input.policy === 'overwrite') {
        copyFileSync(src, dst);
        buckets.overwritten.push(rel);
        return;
    }
    if (input.policy === 'backup') {
        renameSync(dst, free_backup_path(dst));
        copyFileSync(src, dst);
        buckets.backedUp.push(rel);
        return;
    }
    buckets.skipped.push(rel); // default: never overwrite user content
}
