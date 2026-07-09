import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { resolve_launch_from_store } from '../resolveLaunchFromStore.ts';

// SPEC-suspec-v2 AC-004/AC-009 (modelled on the resolve_launch_by_spec tests): the spec resolves
// by id-or-slug against the STORE's flat spec-*.md files; a missing spec errors NAMING the store
// path searched; the runner resolves from suspec.config.json `runners` + the built-ins.

const SPEC = `---\ntype: spec\nid: SPEC-auth\nstatus: ready\ngrammar_version: 1\n---\n\n### AC-001 — x\nDo it.\nVerify with: a test.\n`;

let root: string;
let repo: string;
let store: string;

beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-rlfs-')));
    repo = join(root, 'repo');
    store = join(root, 'state', 'repo');
    mkdirSync(repo, { recursive: true });
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, 'spec-auth.md'), SPEC);
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('resolve_launch_from_store — the spec (AC-004)', () => {
    it('resolves a store spec by frontmatter id → id/slug/absolute path/source', () => {
        const plan = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(plan.spec).toBe('SPEC-auth');
        expect(plan.specSlug).toBe('auth');
        expect(plan.specPath).toBe(join(store, 'spec-auth.md'));
        expect(plan.specSource).toBe(SPEC);
    });

    it('resolves by the filename slug, preferring an id match when both exist', () => {
        // A second spec whose ID is another file's SLUG: `auth` must hit the id, not this slug.
        writeFileSync(join(root, 'state', 'repo', 'spec-zz.md'), `---\nid: auth\n---\nbody\n`);
        const bySlug = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'auth' }));
        expect(bySlug.specSlug).toBe('zz'); // id match wins
        const plain = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(plain.specSlug).toBe('auth');
    });

    it('falls back to the slug as the id when the spec has no frontmatter id', () => {
        writeFileSync(join(store, 'spec-noid.md'), `---\ntype: spec\nstatus: ready\n---\n\nbody\n`);
        const plan = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'noid' }));
        expect(plan.spec).toBe('noid');
    });

    it('a missing spec errors NAMING the store path searched (exit-2 usage error)', () => {
        const error = assertErr(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-nope' }));
        expect(error._tag).toBe('Usage');
        expect(error.message).toContain(store);
        expect(error.message).toMatch(/no spec with that id or slug/);
        expect(error.message).toMatch(/spec-\*\.md/);
    });

    it('a missing or unreadable store dir errors the same way — never a crash', () => {
        const gone = join(root, 'state', 'nowhere');
        expect(assertErr(resolve_launch_from_store({ repoRoot: repo, storeDir: gone, spec: 'x' })).message).toContain(
            gone
        );
        const asFile = join(root, 'state', 'flat');
        writeFileSync(asFile, 'not a dir');
        expect(assertErr(resolve_launch_from_store({ repoRoot: repo, storeDir: asFile, spec: 'x' }))._tag).toBe(
            'Usage'
        );
    });

    it('skips a directory masquerading as spec-*.md and non-spec files', () => {
        mkdirSync(join(store, 'spec-dir.md'));
        writeFileSync(join(store, 'run-auth.md'), '---\ntype: run\nid: SPEC-other\n---\n');
        const plan = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(plan.specSlug).toBe('auth');
        // The dir cannot satisfy a slug lookup either.
        assertErr(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'dir' }));
    });
});

describe('resolve_launch_from_store — the runner (AC-009)', () => {
    it('defaults to the claude built-in when the repo has no suspec.config.json', () => {
        const plan = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(plan.runner).toEqual({ name: 'claude', command_template: 'claude {prompt}' });
    });

    it('resolves runners.default and an explicit --runner from the config map', () => {
        writeFileSync(
            join(repo, 'suspec.config.json'),
            JSON.stringify({ runners: { default: 'mine', mine: { command_template: '/bin/agent {prompt}' } } })
        );
        const byDefault = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(byDefault.runner.name).toBe('mine');
        const codex = assertOk(
            resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth', runner: 'codex' })
        );
        expect(codex.runner.command_template).toContain('writable_roots=["{store}"]');
    });

    it('an unknown runner errors listing the known ones; malformed config degrades to built-ins', () => {
        writeFileSync(join(repo, 'suspec.config.json'), '{ not json');
        const plan = assertOk(resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth' }));
        expect(plan.runner.name).toBe('claude');
        const error = assertErr(
            resolve_launch_from_store({ repoRoot: repo, storeDir: store, spec: 'SPEC-auth', runner: 'zz' })
        );
        expect(error.message).toMatch(/unknown runner "zz" — known runners: claude, codex/);
    });
});
