import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { run_spec_checks } from '../services/checksContract.ts';
import { scaffold_store_spec } from '../useCases/scaffoldStoreSpec.ts';

// SPEC-suspec-v2 AC-023: the `write spec` scaffold — a draft STORE spec cut from a one-line
// intent: valid frontmatter incl. base_sha + the grammar stamp, ONE empty AC with a Verify
// placeholder (no requirement content authored by the CLI), lint-clean under the checks engine.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-writespec-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

const BASE = {
    slug: 'tighten-the-token-parser',
    intent: 'Tighten the token parser',
    baseSha: 'abc123',
};

describe('scaffold_store_spec', () => {
    it('writes spec-<slug>.md: type/id/title/status draft/base_sha/grammar stamp + the intent line', () => {
        const report = assertOk(scaffold_store_spec({ storeDir: store, ...BASE }));
        expect(report).toMatchObject({ specId: 'SPEC-tighten-the-token-parser', created: true });
        const content = readFileSync(join(store, 'spec-tighten-the-token-parser.md'), 'utf8');
        expect(content).toContain('type: spec');
        expect(content).toContain('id: SPEC-tighten-the-token-parser');
        expect(content).toContain('status: draft');
        expect(content).toContain('base_sha: abc123');
        expect(content).toContain('grammar_version:'); // the atomic store write stamped it (AC-003)
        expect(content).toContain('## Intent\n\nTighten the token parser');
        expect(content).toContain('### AC-001'); // exactly one skeleton AC …
        expect(content).toContain('Verify with:'); // … with its Verify placeholder
        expect(content).not.toMatch(/### AC-002/); // the CLI authors NO requirement content
    });

    it('lints CLEAN under the checks engine (zero diagnostics at status: draft)', () => {
        const report = assertOk(scaffold_store_spec({ storeDir: store, ...BASE }));
        const source = readFileSync(report.path, 'utf8');
        const parsed = parse_spec_record({ source, path: report.path });
        expect(isOk(parsed)).toBe(true);
        if (isOk(parsed)) {
            expect(parsed.value.requirements.map((r) => r.id)).toEqual(['AC-001']);
            const diagnostics = run_spec_checks({ spec: parsed.value, exists: () => true });
            expect(diagnostics).toEqual([]);
        }
    });

    it('omits base_sha in a repo with no commits (null)', () => {
        assertOk(scaffold_store_spec({ storeDir: store, ...BASE, baseSha: null }));
        expect(readFileSync(join(store, 'spec-tighten-the-token-parser.md'), 'utf8')).not.toContain('base_sha:');
    });

    it('REUSES an existing namesake byte-untouched (created: false)', () => {
        assertOk(scaffold_store_spec({ storeDir: store, ...BASE }));
        const before = readFileSync(join(store, 'spec-tighten-the-token-parser.md'), 'utf8');
        const again = assertOk(scaffold_store_spec({ storeDir: store, ...BASE, intent: 'DIFFERENT' }));
        expect(again.created).toBe(false);
        expect(readFileSync(join(store, 'spec-tighten-the-token-parser.md'), 'utf8')).toBe(before);
    });

    it('refuses a slug that is not a safe path segment', () => {
        const error = assertErr(scaffold_store_spec({ storeDir: store, ...BASE, slug: '../escape' }));
        expect(error.message).toContain('not a safe path segment');
    });

    it('surfaces the atomic-write failure as an Err', () => {
        const error = assertErr(scaffold_store_spec({ storeDir: join(store, 'missing-dir'), ...BASE }));
        expect(error._tag).toBe('store_write_failed');
    });
});
