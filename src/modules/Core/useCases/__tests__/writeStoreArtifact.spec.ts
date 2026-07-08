import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { write_store_artifact } from '../writeStoreArtifact.ts';

// AC-003 (SPEC-suspec-v2): atomic writes — temp in the same dir + rename, so a crash mid-write
// leaves no partial artifact — and grammar_version injection on the markdown artifacts the CLI authors.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-write-'));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('write_store_artifact — grammar version (AC-003)', () => {
    it('injects grammar_version: 1 into a frontmattered artifact that lacks it', () => {
        const path = join(store, 'run-checkout.md');
        assertOk(write_store_artifact(path, '---\ntype: run\n---\n\n# Run\n'));
        const written = readFileSync(path, 'utf8');
        expect(written).toContain('grammar_version: 1');
        expect(written).toContain('type: run');
    });

    it('prepends frontmatter with grammar_version: 1 when the content has none', () => {
        const path = join(store, 'spec-checkout.md');
        assertOk(write_store_artifact(path, '# Spec body\n'));
        expect(readFileSync(path, 'utf8').startsWith('---\ngrammar_version: 1\n---\n')).toBe(true);
    });

    it('keeps an already-versioned artifact byte-identical', () => {
        const path = join(store, 'spec-versioned.md');
        const content = '---\ngrammar_version: 1\ntype: spec\n---\nbody\n';
        assertOk(write_store_artifact(path, content));
        expect(readFileSync(path, 'utf8')).toBe(content);
    });

    it('passes non-markdown payloads through byte-identical (evidence captures)', () => {
        const path = join(store, 'output.txt');
        assertOk(write_store_artifact(path, 'raw output — no frontmatter\n'));
        expect(readFileSync(path, 'utf8')).toBe('raw output — no frontmatter\n');
    });
});

describe('write_store_artifact — atomicity (AC-003)', () => {
    it('stages a hidden temp in the target directory and renames it over the target', () => {
        const path = join(store, 'spec-atomic.md');
        const calls: { from: string; to: string }[] = [];
        assertOk(
            write_store_artifact(path, 'body\n', {
                rename: (from, to) => {
                    calls.push({ from, to });
                    renameSync(from, to);
                },
            })
        );
        expect(calls).toHaveLength(1);
        expect(dirname(calls[0].from)).toBe(store); // same dir — rename is atomic only within one fs
        expect(basename(calls[0].from).startsWith('.spec-atomic.md.tmp-')).toBe(true);
        expect(calls[0].to).toBe(path);
        expect(readdirSync(store)).toEqual(['spec-atomic.md']); // no temp left behind
    });

    it('a crash at rename leaves no partial artifact and no temp', () => {
        const path = join(store, 'spec-crash.md');
        const error = assertErr(
            write_store_artifact(path, 'body\n', {
                rename: () => {
                    throw new Error('simulated crash mid-write');
                },
            })
        );
        expect(error._tag).toBe('store_write_failed');
        expect(existsSync(path)).toBe(false);
        expect(readdirSync(store)).toEqual([]);
    });

    it('a crash while overwriting preserves the previous content untouched', () => {
        const path = join(store, 'run-existing.md');
        writeFileSync(path, 'old content\n', 'utf8');
        assertErr(
            write_store_artifact(path, 'new content\n', {
                rename: () => {
                    throw new Error('simulated crash mid-write');
                },
            })
        );
        expect(readFileSync(path, 'utf8')).toBe('old content\n');
        expect(readdirSync(store)).toEqual(['run-existing.md']);
    });

    it('errors when even the temp cannot be written (missing directory)', () => {
        const error = assertErr(write_store_artifact(join(store, 'no-such-dir', 'spec-x.md'), 'body\n'));
        expect(error._tag).toBe('store_write_failed');
    });
});
