import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { migrate_store } from '../migrateStore.ts';
import { read_grammar_version } from '../../services/grammarVersion.ts';

// AC-003 (SPEC-suspec-v2): `store migrate` — no-op at the current grammar, per-version transform
// upgrades for older artifacts, and the only function allowed to rewrite pre-existing artifacts.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-migrate-'));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

const v1 = (body: string) => `---\ngrammar_version: 1\ntype: spec\n---\n${body}`;

describe('migrate_store (AC-003)', () => {
    it('errors on a missing store dir', () => {
        expect(assertErr(migrate_store({ storeDir: join(store, 'nope') }))._tag).toBe('store_missing');
    });

    it('is a no-op at the current version — root and archive artifacts stay byte-identical', () => {
        const rootArtifact = join(store, 'spec-checkout.md');
        const archivedArtifact = join(store, 'archive', 'run-old.md');
        writeFileSync(rootArtifact, v1('root body\n'), 'utf8');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(archivedArtifact, v1('archived body\n'), 'utf8');

        const report = assertOk(migrate_store({ storeDir: store }));
        expect(report.upgraded).toEqual([]);
        expect(report.newer).toEqual([]);
        expect([...report.current].sort()).toEqual([rootArtifact, archivedArtifact].sort());
        expect(readFileSync(rootArtifact, 'utf8')).toBe(v1('root body\n'));
        expect(readFileSync(archivedArtifact, 'utf8')).toBe(v1('archived body\n'));
    });

    it('stamps an artifact that records no version (reads as the first grammar)', () => {
        const path = join(store, 'spec-unversioned.md');
        writeFileSync(path, '---\ntype: spec\n---\nbody\n', 'utf8');
        const report = assertOk(migrate_store({ storeDir: store }));
        expect(report.upgraded).toEqual([path]);
        const written = readFileSync(path, 'utf8');
        expect(read_grammar_version(written)).toBe(1);
        expect(written).toContain('body\n');
    });

    it('preserves mtime across a rewrite — a migration never resets the gc retention clock', () => {
        const path = join(store, 'archive', 'spec-ancient.md');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(path, '---\ntype: spec\n---\nbody\n', 'utf8'); // unversioned → will be rewritten
        const past = new Date('2026-01-01T00:00:00Z');
        utimesSync(path, past, past);

        const report = assertOk(migrate_store({ storeDir: store }));
        expect(report.upgraded).toEqual([path]);
        expect(read_grammar_version(readFileSync(path, 'utf8'))).toBe(1); // content DID change
        expect(Math.abs(statSync(path).mtimeMs - past.getTime())).toBeLessThan(1000); // clock did NOT
    });

    it('upgrades an older artifact through the transform table and stamps the new version', () => {
        const path = join(store, 'spec-old.md');
        writeFileSync(path, v1('field: old\n'), 'utf8');
        const report = assertOk(
            migrate_store({
                storeDir: store,
                currentVersion: 2,
                transforms: { 1: (content) => content.replace('field: old', 'field: new') },
            })
        );
        expect(report.upgraded).toEqual([path]);
        const written = readFileSync(path, 'utf8');
        expect(read_grammar_version(written)).toBe(2);
        expect(written).toContain('field: new');
        expect(written).not.toContain('field: old');
    });

    it('walks a multi-step chain in order', () => {
        const path = join(store, 'spec-ancient.md');
        writeFileSync(path, v1('body\n'), 'utf8');
        assertOk(
            migrate_store({
                storeDir: store,
                currentVersion: 3,
                transforms: { 1: (c) => `${c}step-1\n`, 2: (c) => `${c}step-2\n` },
            })
        );
        const written = readFileSync(path, 'utf8');
        expect(read_grammar_version(written)).toBe(3);
        expect(written.indexOf('step-1')).toBeLessThan(written.indexOf('step-2'));
    });

    it('refuses a gap in the transform chain rather than guessing', () => {
        writeFileSync(join(store, 'spec-stranded.md'), v1('body\n'), 'utf8');
        const error = assertErr(migrate_store({ storeDir: store, currentVersion: 2, transforms: {} }));
        expect(error._tag).toBe('store_migrate_gap');
    });

    it('never downgrades an artifact from a newer grammar — reported, untouched', () => {
        const path = join(store, 'spec-future.md');
        const content = '---\ngrammar_version: 99\n---\nfrom the future\n';
        writeFileSync(path, content, 'utf8');
        const report = assertOk(migrate_store({ storeDir: store }));
        expect(report.newer).toEqual([path]);
        expect(readFileSync(path, 'utf8')).toBe(content);
    });

    it('touches only markdown artifacts — markers and evidence payloads are invisible to it', () => {
        writeFileSync(join(store, '.repo-path'), '/some/repo\n', 'utf8');
        mkdirSync(join(store, 'evidence', 'checkout'), { recursive: true });
        writeFileSync(join(store, 'evidence', 'checkout', 'verify.txt'), 'exit 0\n', 'utf8');
        const report = assertOk(migrate_store({ storeDir: store }));
        expect([...report.upgraded, ...report.current, ...report.newer]).toEqual([]);
        expect(readFileSync(join(store, '.repo-path'), 'utf8')).toBe('/some/repo\n');
        expect(readFileSync(join(store, 'evidence', 'checkout', 'verify.txt'), 'utf8')).toBe('exit 0\n');
    });

    it('errors when an artifact cannot be read', () => {
        const path = join(store, 'spec-locked.md');
        writeFileSync(path, v1('body\n'), 'utf8');
        chmodSync(path, 0o000);
        try {
            expect(assertErr(migrate_store({ storeDir: store }))._tag).toBe('store_artifact_unreadable');
        } finally {
            chmodSync(path, 0o644);
        }
    });

    it('propagates an atomic-write failure (read-only store dir)', () => {
        const path = join(store, 'spec-unversioned.md');
        writeFileSync(path, '---\ntype: spec\n---\nbody\n', 'utf8'); // needs a stamp → needs a write
        chmodSync(store, 0o555);
        try {
            expect(assertErr(migrate_store({ storeDir: store }))._tag).toBe('store_write_failed');
        } finally {
            chmodSync(store, 0o755);
        }
    });
});
