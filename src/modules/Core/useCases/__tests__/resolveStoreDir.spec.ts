import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { resolve_store_dir, REPO_PATH_MARKER } from '../resolveStoreDir.ts';

// AC-001 (SPEC-suspec-v2): store resolution — <state-root>/<repo-name>/ with precedence
// env SUSPEC_STATE_DIR > config state_root > ~/.claude/state, and marker-based collision handling
// (`.repo-path` records the owning repo; resolution matches by recorded path, never basename guess).

let root: string; // one throwaway root per test — repos and state roots live under it

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-store-')));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

const make_repo = (...segments: string[]): string => {
    const repo = join(root, ...segments);
    mkdirSync(repo, { recursive: true });
    return repo;
};

describe('resolve_store_dir — state-root precedence (AC-001)', () => {
    it('defaults to <home>/.claude/state/<repo-name>/ and creates dir + marker on first resolution', () => {
        const repo = make_repo('proj');
        const home = join(root, 'home');
        // No `config` passed and no suspec.config.json on disk — the no-config default path.
        const first = assertOk(resolve_store_dir({ repoRoot: repo, env: {}, home: () => home }));
        expect(first.storeDir).toBe(join(home, '.claude', 'state', 'proj'));
        expect(first.created).toBe(true);
        expect(readFileSync(join(first.storeDir, REPO_PATH_MARKER), 'utf8')).toBe(`${resolve(repo)}\n`);

        const again = assertOk(resolve_store_dir({ repoRoot: repo, env: {}, config: null, home: () => home }));
        expect(again.storeDir).toBe(first.storeDir);
        expect(again.created).toBe(false);
    });

    it('env SUSPEC_STATE_DIR overrides everything, including a config state_root', () => {
        const repo = make_repo('proj');
        const envRoot = join(root, 'env-state');
        const configRoot = join(root, 'config-state');
        const resolved = assertOk(
            resolve_store_dir({
                repoRoot: repo,
                env: { SUSPEC_STATE_DIR: envRoot },
                config: { state_root: configRoot },
                home: () => join(root, 'home'),
            })
        );
        expect(resolved.storeDir).toBe(join(envRoot, 'proj'));
    });

    it('config state_root overrides the default when the env is silent', () => {
        const repo = make_repo('proj');
        const configRoot = join(root, 'config-state');
        const resolved = assertOk(
            resolve_store_dir({ repoRoot: repo, env: {}, config: { state_root: configRoot }, home: () => join(root, 'home') })
        );
        expect(resolved.storeDir).toBe(join(configRoot, 'proj'));
    });

    it('reads state_root from <repoRoot>/suspec.config.json when no config is passed', () => {
        const repo = make_repo('proj');
        const configRoot = join(root, 'disk-config-state');
        writeFileSync(join(repo, 'suspec.config.json'), JSON.stringify({ state_root: configRoot }), 'utf8');
        const resolved = assertOk(resolve_store_dir({ repoRoot: repo, env: {}, home: () => join(root, 'home') }));
        expect(resolved.storeDir).toBe(join(configRoot, 'proj'));
    });

    it('falls back to the default on an unparseable, non-object, or state_root-less config file', () => {
        const home = join(root, 'home');
        for (const [name, body] of [
            ['broken', '{ not json'],
            ['scalar', '42'],
            ['keyless', '{"setup": []}'],
        ] as const) {
            const repo = make_repo(`${name}-proj`);
            writeFileSync(join(repo, 'suspec.config.json'), body, 'utf8');
            const resolved = assertOk(resolve_store_dir({ repoRoot: repo, env: {}, home: () => home }));
            expect(resolved.storeDir).toBe(join(home, '.claude', 'state', `${name}-proj`));
        }
    });

    it('expands a leading ~ in a configured state_root via the injected home (never a literal ~)', () => {
        const home = join(root, 'home');
        const repoTilde = make_repo('tilde-proj');
        const withSlash = assertOk(
            resolve_store_dir({ repoRoot: repoTilde, env: {}, config: { state_root: '~/suspec-state' }, home: () => home })
        );
        expect(withSlash.storeDir).toBe(join(home, 'suspec-state', 'tilde-proj'));

        const repoBare = make_repo('bare-proj');
        const bare = assertOk(
            resolve_store_dir({ repoRoot: repoBare, env: {}, config: { state_root: '~' }, home: () => home })
        );
        expect(bare.storeDir).toBe(join(home, 'bare-proj'));
    });
});

describe('resolve_store_dir — same-basename collisions (AC-001)', () => {
    it('gives two repos sharing a basename distinct suffixed dirs, stable across calls in any order', () => {
        const stateRoot = join(root, 'state');
        const env = { SUSPEC_STATE_DIR: stateRoot };
        const repoA = make_repo('a', 'proj');
        const repoB = make_repo('b', 'proj');

        const a1 = assertOk(resolve_store_dir({ repoRoot: repoA, env, config: null }));
        const b1 = assertOk(resolve_store_dir({ repoRoot: repoB, env, config: null }));
        expect(a1.storeDir).toBe(join(stateRoot, 'proj'));
        expect(b1.storeDir).toBe(join(stateRoot, 'proj-2'));

        // Stability: re-resolution matches by recorded path — in reverse order too, never a guess.
        const b2 = assertOk(resolve_store_dir({ repoRoot: repoB, env, config: null }));
        const a2 = assertOk(resolve_store_dir({ repoRoot: repoA, env, config: null }));
        expect(b2).toEqual({ storeDir: b1.storeDir, created: false });
        expect(a2).toEqual({ storeDir: a1.storeDir, created: false });
    });

    it('never adopts a dir that records no repo path — a markerless dir is not a match', () => {
        const stateRoot = join(root, 'state');
        mkdirSync(join(stateRoot, 'proj'), { recursive: true }); // exists, but no .repo-path
        const repo = make_repo('proj');
        const resolved = assertOk(resolve_store_dir({ repoRoot: repo, env: { SUSPEC_STATE_DIR: stateRoot }, config: null }));
        expect(resolved.storeDir).toBe(join(stateRoot, 'proj-2'));
    });

    it('errors when the marker cannot be read', () => {
        const stateRoot = join(root, 'state');
        // A directory named .repo-path makes readFileSync throw without deleting anything.
        mkdirSync(join(stateRoot, 'proj', REPO_PATH_MARKER), { recursive: true });
        const repo = make_repo('proj');
        const error = assertErr(resolve_store_dir({ repoRoot: repo, env: { SUSPEC_STATE_DIR: stateRoot }, config: null }));
        expect(error._tag).toBe('store_marker_unreadable');
    });

    it('errors when the store dir cannot be created', () => {
        const stateRoot = join(root, 'state-as-file');
        writeFileSync(stateRoot, 'not a dir', 'utf8');
        const repo = make_repo('proj');
        const error = assertErr(resolve_store_dir({ repoRoot: repo, env: { SUSPEC_STATE_DIR: stateRoot }, config: null }));
        expect(error._tag).toBe('store_dir_create_failed');
    });

    it('errors when every collision suffix is claimed by another repo', () => {
        const stateRoot = join(root, 'state');
        for (let n = 1; n <= 100; n += 1) {
            const dir = join(stateRoot, n === 1 ? 'proj' : `proj-${n}`);
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, REPO_PATH_MARKER), `/somewhere/else/${n}/proj\n`, 'utf8');
        }
        const repo = make_repo('proj');
        const error = assertErr(resolve_store_dir({ repoRoot: repo, env: { SUSPEC_STATE_DIR: stateRoot }, config: null }));
        expect(error._tag).toBe('store_dir_exhausted');
        // Nothing was created or overwritten along the way.
        expect(existsSync(join(stateRoot, 'proj-101'))).toBe(false);
    });
});
