import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { scaffold_fix_spec } from '../useCases/scaffoldFixSpec.ts';

// SPEC-suspec-v2 AC-017: the fix-spec scaffold — a store spec cut from a finding/issue, carrying
// base_sha + affected_areas so the staleness gate works on it, reusing (never clobbering) a namesake.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-fixspec-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

const BASE = {
    slug: 'fix-find-007',
    title: 'The token refresh races',
    sourceRef: 'FIND-007',
    sourceBody: 'It races.\n\nSteps: run twice.',
    baseSha: 'abc123',
    affectedAreas: ['src/auth'] as const,
};

describe('scaffold_fix_spec', () => {
    it('writes spec-fix-<slug>.md with id, ready status, base_sha, affected_areas, and the verbatim source', () => {
        const report = assertOk(scaffold_fix_spec({ storeDir: store, ...BASE, affectedAreas: [...BASE.affectedAreas] }));
        expect(report).toMatchObject({ specId: 'SPEC-fix-find-007', slug: 'fix-find-007', created: true });
        const content = readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8');
        expect(content).toContain('type: spec');
        expect(content).toContain('id: SPEC-fix-find-007');
        expect(content).toContain('status: ready');
        expect(content).toContain('base_sha: abc123');
        expect(content).toContain('affected_areas:\n  - src/auth');
        expect(content).toContain('source: FIND-007');
        expect(content).toContain('It races.\n\nSteps: run twice.');
        expect(content).toContain('### AC-001'); // a real spec shape — work can launch it
        expect(content).toContain('grammar_version:'); // the atomic store write stamped it (AC-003)
    });

    it('omits base_sha when null, the areas block when empty, and placeholders an empty body', () => {
        assertOk(
            scaffold_fix_spec({ storeDir: store, ...BASE, baseSha: null, affectedAreas: [], sourceBody: '' })
        );
        const content = readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8');
        expect(content).not.toContain('base_sha:');
        expect(content).not.toContain('affected_areas:');
        expect(content).toContain('(the source carried no body)');
    });

    it('records gh labels when present', () => {
        assertOk(scaffold_fix_spec({ storeDir: store, ...BASE, affectedAreas: [], labels: ['bug', 'p1'] }));
        expect(readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8')).toContain('labels: bug, p1');
    });

    it('REUSES an existing namesake byte-untouched (created: false)', () => {
        assertOk(scaffold_fix_spec({ storeDir: store, ...BASE, affectedAreas: [] }));
        const before = readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8');
        const again = assertOk(
            scaffold_fix_spec({ storeDir: store, ...BASE, affectedAreas: [], title: 'DIFFERENT' })
        );
        expect(again.created).toBe(false);
        expect(readFileSync(join(store, 'spec-fix-find-007.md'), 'utf8')).toBe(before);
    });

    it('refuses a slug that is not a safe path segment', () => {
        const error = assertErr(scaffold_fix_spec({ storeDir: store, ...BASE, slug: '../escape', affectedAreas: [] }));
        expect(error.message).toContain('not a safe path segment');
    });

    it('surfaces the atomic-write failure as an Err', () => {
        const error = assertErr(
            scaffold_fix_spec({ storeDir: join(store, 'missing-dir'), ...BASE, affectedAreas: [] })
        );
        expect(error._tag).toBe('store_write_failed');
    });
});
