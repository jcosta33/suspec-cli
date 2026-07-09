// Store resolution (SPEC-suspec-v2 AC-001): the store for a repo is `<state-root>/<repo-name>/`.
// state-root precedence: env `SUSPEC_STATE_DIR` > `state_root` in the consumer-side
// suspec.config.json > `~/.claude/state`. `<repo-name>` is the repo directory's basename; when two
// different repo paths share a basename, the later one takes a stable `-2`/`-3` suffix. Every store
// dir records its owning repo's absolute path in a `.repo-path` marker, and resolution matches by
// recorded path — never by a basename guess — so the mapping is stable across calls. The first
// resolution creates the dir + marker.
//
// Resolution is two-phase: (1) scan EVERY existing `<base>`/`<base>-k` slot for a marker matching
// this repo — so a repo whose earlier sibling slot was purged keeps resolving to its own suffixed
// store instead of claiming the freed base slot and stranding its history; (2) only when no marker
// anywhere matches, claim the first free slot atomically (non-recursive mkdir + 'wx' marker write)
// so two concurrent first-resolves can never both adopt one slot.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, isAbsolute, join, resolve } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';

export const REPO_PATH_MARKER = '.repo-path';

const CONFIG_FILENAME = 'suspec.config.json';

// Defensive ceiling on collision suffixes — past this many same-basename repos something is wrong.
const MAX_COLLISION_SUFFIX = 100;

export type StoreConfig = Readonly<{ state_root?: string }> | null;

export type ResolveStoreDirInput = Readonly<{
    repoRoot: string;
    // The environment to consult for SUSPEC_STATE_DIR — injectable so tests never touch the real one.
    env?: Readonly<Record<string, string | undefined>>;
    // The parsed consumer-side config. Omitted → read from `<repoRoot>/suspec.config.json`;
    // explicit null → no config.
    config?: StoreConfig;
    // Injectable home for tests; defaults to os.homedir() (never the string '~').
    home?: () => string;
    // Probe-only resolution: NEVER create a dir or marker — err `store_dir_not_found` when this
    // repo has no store yet. The read-only faces (`suspec review`'s store-run lint) use it so a
    // repo that never launched a run is left byte-untouched.
    probe?: boolean;
    // Injectable claim-side fs writes — a test seam: the lost claim race (another process creates
    // the slot between our probe and our mkdir) cannot be reproduced deterministically against the
    // real fs, so tests wrap these to interleave a competing claim. Defaults to the real fs.
    fs?: Readonly<{ mkdirSync: typeof mkdirSync; writeFileSync: typeof writeFileSync }>;
}>;

export type StoreDirResolution = Readonly<{ storeDir: string; created: boolean }>;

// Default reader for the consumer-side suspec.config.json — null (no config) when the file is
// absent, unparseable, or carries no usable `state_root`.
function read_store_config(repoRoot: string): StoreConfig {
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path)) {
        return null;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const stateRoot = (raw as Record<string, unknown>).state_root;
    return typeof stateRoot === 'string' && stateRoot.length > 0 ? { state_root: stateRoot } : null;
}

// A configured state-root may be written `~/...` — expand it via the injected home, never a literal '~'.
function expand_home(root: string, home: () => string): string {
    if (root === '~') {
        return home();
    }
    if (root.startsWith('~/')) {
        return join(home(), root.slice(2));
    }
    return root;
}

// Canonicalize a path for marker comparison: resolve symlinks when the path exists, fall back to
// a plain lexical resolve when it does not (a recorded repo may have been moved or deleted).
function canonical_path(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
}

// The name of the nth slot for a basename: `<base>`, then `<base>-2`, `<base>-3`, …
function slot_dir(stateRoot: string, base: string, n: number): string {
    return join(stateRoot, n === 1 ? base : `${base}-${n}`);
}

export function resolve_store_dir(input: ResolveStoreDirInput): Result<StoreDirResolution, AppError> {
    const home = input.home ?? homedir;
    const env = input.env ?? process.env;
    const fs = input.fs ?? { mkdirSync, writeFileSync };
    const config = input.config !== undefined ? input.config : read_store_config(input.repoRoot);

    const envRoot = env.SUSPEC_STATE_DIR;
    const configured = envRoot !== undefined && envRoot.length > 0 ? envRoot : config?.state_root;
    const stateRoot = expand_home(configured ?? join(home(), '.claude', 'state'), home);
    // A relative state-root would silently resolve against the process cwd — a hostile or sloppy
    // suspec.config.json could relocate the store per-invocation. Reject it as a usage error
    // naming the key that carried the value; `~`-forms were already expanded above.
    if (configured !== undefined && !isAbsolute(stateRoot)) {
        const key = envRoot !== undefined && envRoot.length > 0 ? 'SUSPEC_STATE_DIR' : 'state_root';
        return err(
            createAppError(
                'state_root_not_absolute',
                `${key} must be an absolute path (or start with ~/): got "${configured}"`,
                { key, value: configured }
            )
        );
    }

    const repoPath = resolve(input.repoRoot);
    const repoCanonical = canonical_path(repoPath);
    const base = basename(repoPath);

    // Phase 1 — match scan: prefer an existing marker match ANYWHERE in the slot range over
    // claiming a free slot. A purge of a sibling repo's `<base>` slot frees slot 1; without the
    // full scan, this repo's next resolve would claim the freed slot as a fresh store and strand
    // its real `<base>-k` store forever.
    for (let n = 1; n <= MAX_COLLISION_SUFFIX; n += 1) {
        const dir = slot_dir(stateRoot, base, n);
        if (!existsSync(dir)) {
            continue;
        }
        const marker = join(dir, REPO_PATH_MARKER);
        if (!existsSync(marker)) {
            // A markerless dir records nothing — never adopt on a basename guess.
            continue;
        }
        let recorded: string;
        try {
            recorded = readFileSync(marker, 'utf8').trim();
        } catch (cause) {
            return err(
                createAppError(
                    'store_marker_unreadable',
                    `Could not read the store marker at ${marker}`,
                    { marker },
                    cause
                )
            );
        }
        if (canonical_path(recorded) === repoCanonical) {
            return ok({ storeDir: dir, created: false });
        }
    }

    if (input.probe === true) {
        return err(createAppError('store_dir_not_found', `No store dir recorded for ${repoPath}`, { repoPath }));
    }

    // Phase 2 — claim the first free slot atomically. Two first-resolves can race between the
    // probe and the claim, so the claim itself must be the arbiter: a NON-recursive mkdir throws
    // EEXIST when the other process created the dir first (recursive mode swallows it), and the
    // marker is written with flag 'wx' so an existing marker is never overwritten — on either
    // collision we re-read the winner's marker and only adopt the slot if it records our repo.
    try {
        mkdirSync(stateRoot, { recursive: true });
    } catch (cause) {
        return err(
            createAppError(
                'store_dir_create_failed',
                `Could not create the state root at ${stateRoot}`,
                { dir: stateRoot },
                cause
            )
        );
    }
    for (let n = 1; n <= MAX_COLLISION_SUFFIX; n += 1) {
        const dir = slot_dir(stateRoot, base, n);
        if (existsSync(dir)) {
            continue; // occupied (foreign or markerless) — phase 1 already ruled out a match
        }
        const marker = join(dir, REPO_PATH_MARKER);
        try {
            fs.mkdirSync(dir);
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
                // Lost the dir race — fall through to the marker comparison below.
            } else {
                return err(
                    createAppError('store_dir_create_failed', `Could not create the store dir at ${dir}`, { dir }, cause)
                );
            }
        }
        try {
            fs.writeFileSync(marker, `${repoPath}\n`, { encoding: 'utf8', flag: 'wx' });
            return ok({ storeDir: dir, created: true });
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') {
                return err(
                    createAppError('store_dir_create_failed', `Could not create the store dir at ${dir}`, { dir }, cause)
                );
            }
        }
        // Someone else's marker landed first — adopt the slot only if it records this repo
        // (a concurrent resolve of the SAME repo), otherwise move on to the next free slot.
        let recorded: string;
        try {
            recorded = readFileSync(marker, 'utf8').trim();
            /* v8 ignore next 5 -- the 'wx' write just EEXISTed on this marker; an unreadable read needs it deleted in the same instant */
        } catch (cause) {
            return err(
                createAppError('store_marker_unreadable', `Could not read the store marker at ${marker}`, { marker }, cause)
            );
        }
        if (canonical_path(recorded) === repoCanonical) {
            return ok({ storeDir: dir, created: false });
        }
    }
    return err(
        createAppError(
            'store_dir_exhausted',
            `Could not resolve a store dir for ${repoPath}: ${MAX_COLLISION_SUFFIX} collision suffixes exhausted under ${stateRoot}`,
            { repoPath, stateRoot }
        )
    );
}
