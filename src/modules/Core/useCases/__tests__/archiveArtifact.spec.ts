import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { archive_artifact } from '../archiveArtifact.ts';
import { write_store_artifact } from '../writeStoreArtifact.ts';
import { evidence_dir } from '../../services/storeLayout.ts';

// AC-002 (SPEC-suspec-v2): archiving moves a flat artifact to archive/ unchanged, and the store
// never grows a directory beyond evidence/<run>/ and archive/.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-archive-'));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('archive_artifact (AC-002)', () => {
    it('moves the artifact into archive/ with identical content and removes the original', () => {
        const content = '---\ngrammar_version: 1\ntype: finding\n---\nthe finding body\n';
        writeFileSync(join(store, 'finding-001.md'), content, 'utf8');

        const archived = assertOk(archive_artifact(store, 'finding-001.md'));
        expect(archived.archivedPath).toBe(join(store, 'archive', 'finding-001.md'));
        expect(readFileSync(archived.archivedPath, 'utf8')).toBe(content);
        expect(existsSync(join(store, 'finding-001.md'))).toBe(false);
    });

    it('refuses a filename that is not a single flat segment', () => {
        expect(assertErr(archive_artifact(store, '../spec-escape.md'))._tag).toBe('store_archive_invalid_filename');
        expect(assertErr(archive_artifact(store, 'nested/spec-x.md'))._tag).toBe('store_archive_invalid_filename');
    });

    it('refuses a missing artifact', () => {
        expect(assertErr(archive_artifact(store, 'spec-ghost.md'))._tag).toBe('store_artifact_not_found');
    });

    it('refuses to clobber an already-archived namesake', () => {
        writeFileSync(join(store, 'spec-dup.md'), 'live\n', 'utf8');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'spec-dup.md'), 'archived earlier\n', 'utf8');
        expect(assertErr(archive_artifact(store, 'spec-dup.md'))._tag).toBe('store_archive_collision');
        expect(readFileSync(join(store, 'archive', 'spec-dup.md'), 'utf8')).toBe('archived earlier\n');
    });

    it('errors when archive/ cannot be created', () => {
        writeFileSync(join(store, 'spec-x.md'), 'body\n', 'utf8');
        writeFileSync(join(store, 'archive'), 'a file squatting the archive name', 'utf8');
        expect(assertErr(archive_artifact(store, 'spec-x.md'))._tag).toBe('store_archive_failed');
    });

    it('a store pass leaves only flat files + evidence/ + archive/ in the store root', () => {
        // The Wave-1 slice of the AC-002 layout test: exercise every store surface that creates
        // paths — flat writes, an evidence dir, an archive move — then assert the root's shape.
        // (The full `work → evidence add → done` pass lands with those commands in later waves.)
        assertOk(write_store_artifact(join(store, 'spec-checkout.md'), '# spec\n'));
        assertOk(write_store_artifact(join(store, 'run-checkout.md'), '# run\n'));
        assertOk(write_store_artifact(join(store, 'finding-001.md'), '# finding\n'));
        mkdirSync(evidence_dir(store, 'checkout'), { recursive: true });
        assertOk(write_store_artifact(join(evidence_dir(store, 'checkout'), 'verify-01.txt'), 'exit 0\n'));
        assertOk(archive_artifact(store, 'finding-001.md'));

        expect(readdirSync(store).sort()).toEqual(['archive', 'evidence', 'run-checkout.md', 'spec-checkout.md']);
        expect(readdirSync(join(store, 'archive'))).toEqual(['finding-001.md']);
        expect(readdirSync(join(store, 'evidence'))).toEqual(['checkout']);
    });
});
