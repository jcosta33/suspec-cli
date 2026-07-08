// Store resolution (SPEC-suspec-v2 AC-001): the store for a repo is `<state-root>/<repo-name>/`.
// state-root precedence: env `SUSPEC_STATE_DIR` > `state_root` in the consumer-side
// suspec.config.json > `~/.claude/state`. `<repo-name>` is the repo directory's basename; when two
// different repo paths share a basename, the later one takes a stable `-2`/`-3` suffix. Every store
// dir records its owning repo's absolute path in a `.repo-path` marker, and resolution matches by
// recorded path — never by a basename guess — so the mapping is stable across calls. The first
// resolution creates the dir + marker.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, join, resolve } from 'path';

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

export function resolve_store_dir(input: ResolveStoreDirInput): Result<StoreDirResolution, AppError> {
    const home = input.home ?? homedir;
    const env = input.env ?? process.env;
    const config = input.config !== undefined ? input.config : read_store_config(input.repoRoot);

    const envRoot = env.SUSPEC_STATE_DIR;
    const configured = envRoot !== undefined && envRoot.length > 0 ? envRoot : config?.state_root;
    const stateRoot = expand_home(configured ?? join(home(), '.claude', 'state'), home);

    const repoPath = resolve(input.repoRoot);
    const base = basename(repoPath);

    for (let n = 1; n <= MAX_COLLISION_SUFFIX; n += 1) {
        const dir = join(stateRoot, n === 1 ? base : `${base}-${n}`);
        const marker = join(dir, REPO_PATH_MARKER);
        if (!existsSync(dir)) {
            // Fresh slot: claim it — create the dir and record the owning repo path.
            try {
                mkdirSync(dir, { recursive: true });
                writeFileSync(marker, `${repoPath}\n`, 'utf8');
            } catch (cause) {
                return err(
                    createAppError('store_dir_create_failed', `Could not create the store dir at ${dir}`, { dir }, cause)
                );
            }
            return ok({ storeDir: dir, created: true });
        }
        let recorded: string | null = null;
        if (existsSync(marker)) {
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
        }
        if (recorded === repoPath) {
            return ok({ storeDir: dir, created: false });
        }
        // The dir belongs to a different repo (or records nothing) — never adopt on a basename
        // guess; try the next suffix.
    }
    return err(
        createAppError(
            'store_dir_exhausted',
            `Could not resolve a store dir for ${repoPath}: ${MAX_COLLISION_SUFFIX} collision suffixes exhausted under ${stateRoot}`,
            { repoPath, stateRoot }
        )
    );
}
