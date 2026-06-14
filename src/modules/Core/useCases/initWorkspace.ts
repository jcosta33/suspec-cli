// PrepareEngine.init (AC-012 / AC-016): copy the swarm-starter-kit into the target WITHOUT ever
// overwriting the user's content by default. Plans before writing — each kit file is new (write),
// identical (no-op, so a re-run is idempotent), or a conflict (exists & differs). Conflicts are
// skipped by default; --force / backup are the escape hatches. `.gitignore` and `AGENTS.md` merge a
// delimited Swarm block instead of skipping, so adoption-into-an-existing-repo is useful, not inert.
// The source is a resolved kit directory (cloned from GitHub or supplied via --from) — the clone I/O
// is a separate step, so this engine is exercised against a local fixture in tests.

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
} from 'fs';
import { join, relative, dirname } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { merge_marker_block } from '../services/markerBlock.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type ConflictPolicy = 'skip' | 'overwrite' | 'backup';
export type InitMode = 'workspace' | 'footprint';

export type InitReport = Readonly<{
    level: OutcomeLevel;
    mode: InitMode;
    written: readonly string[];
    skipped: readonly string[];
    merged: readonly string[];
    backedUp: readonly string[];
    overwritten: readonly string[];
}>;

export type InitWorkspaceInput = Readonly<{
    sourceDir: string;
    targetDir: string;
    policy: ConflictPolicy;
    mode: InitMode;
}>;

const GITIGNORE_START = '# >>> swarm >>>';
const GITIGNORE_END = '# <<< swarm <<<';
const AGENTS_START = '<!-- swarm:start -->';
const AGENTS_END = '<!-- swarm:end -->';
const GITIGNORE_FALLBACK = '.swarm-cache/\n*.swarm-bak';
const AGENTS_POINTER = [
    'This repository is adopted into a Swarm workflow. The spec / task / review',
    'workspace and templates come from the Swarm starter kit',
    '(github.com/jcosta33/swarm-starter-kit). Run `swarm --help` for the commands.',
].join('\n');

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

export function init_workspace(input: InitWorkspaceInput): Result<InitReport, AppError> {
    if (!existsSync(input.sourceDir)) {
        return err(
            createAppError('InitSourceMissing', `kit source not found: ${input.sourceDir}`, { source: input.sourceDir })
        );
    }

    const written: string[] = [];
    const skipped: string[] = [];
    const merged: string[] = [];
    const backedUp: string[] = [];
    const overwritten: string[] = [];

    // Any filesystem write can fail (a read-only target, a permission boundary). Route those through
    // the Result channel as a clean error rather than letting an EACCES/EISDIR stack trace escape (and
    // break a `--json` consumer). A partial scaffold may be left behind — re-run is conflict-safe.
    try {
        // `.gitignore` always merges the kit's required ignores (idempotent marker block) in both modes.
        merge_gitignore(input, merged, written);

        if (input.mode === 'footprint') {
            // Footprint: the kit's workspace tree is NOT dumped — only a pointer block merged into AGENTS.md.
            merge_agents_pointer(input, merged, written);
        } else {
            // Workspace: copy the whole kit tree; AGENTS.md is a plain copied file (conflict-handled like
            // any other), so a re-run is a no-op. `.gitignore` is handled by the merge above; its
            // `.additions` source is consumed as the block, not copied.
            for (const rel of walk_files(input.sourceDir, input.sourceDir)) {
                if (rel === '.gitignore' || rel === '.gitignore.additions') {
                    continue;
                }
                copy_plain(input, rel, { written, skipped, backedUp, overwritten });
            }
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return err(
            createAppError('InitWriteFailed', `could not write the workspace into ${input.targetDir}: ${reason}`, {
                target: input.targetDir,
            })
        );
    }

    return ok({
        level: skipped.length > 0 ? 'warning' : 'clean',
        mode: input.mode,
        written,
        skipped,
        merged,
        backedUp,
        overwritten,
    });
}

function merge_gitignore(input: InitWorkspaceInput, merged: string[], written: string[]): void {
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

// Footprint only: merge a small Swarm pointer block into AGENTS.md (create it from the block if
// absent). Idempotent — the marker block is replaced in place on re-run, never duplicated.
function merge_agents_pointer(input: InitWorkspaceInput, merged: string[], written: string[]): void {
    const target = join(input.targetDir, 'AGENTS.md');
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const next = merge_marker_block({
        existing,
        block: AGENTS_POINTER,
        startMarker: AGENTS_START,
        endMarker: AGENTS_END,
    });
    if (next === existing) {
        return;
    }
    write_file(target, next);
    (existing.length > 0 ? merged : written).push('AGENTS.md');
}

type PlainBuckets = { written: string[]; skipped: string[]; backedUp: string[]; overwritten: string[] };

function copy_plain(input: InitWorkspaceInput, rel: string, buckets: PlainBuckets): void {
    const src = join(input.sourceDir, rel);
    const dst = join(input.targetDir, rel);

    if (lstatSync(src).isSymbolicLink()) {
        if (!existsSync(dst)) {
            mkdirSync(dirname(dst), { recursive: true });
            symlinkSync(readlinkSync(src), dst);
            buckets.written.push(rel);
        }
        return;
    }

    if (!existsSync(dst)) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        buckets.written.push(rel);
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
        renameSync(dst, `${dst}.swarm-bak`);
        copyFileSync(src, dst);
        buckets.backedUp.push(rel);
        return;
    }
    buckets.skipped.push(rel); // default: never overwrite user content
}
