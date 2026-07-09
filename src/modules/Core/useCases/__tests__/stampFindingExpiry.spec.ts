import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { expiry_date, stamp_finding_expiry, FINDING_EXPIRY_DAYS } from '../stampFindingExpiry.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';

// SPEC-suspec-v2 AC-015: keep/defer stamps `expires:` (+30d default) — the decay hook.

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-expiry-'));
    writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nrun: feat\n---\n\n# Lesson\n\nbody\n');
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('stamp_finding_expiry', () => {
    it('stamps expires +30 days by default, preserving the body', () => {
        const now = new Date('2026-07-09T10:00:00.000Z');
        const result = assertOk(stamp_finding_expiry({ storeDir: store, filename: 'finding-001.md', now: () => now }));
        expect(result.expires).toBe('2026-08-08');
        expect(FINDING_EXPIRY_DAYS).toBe(30);
        const content = readFileSync(join(store, 'finding-001.md'), 'utf8');
        expect(content).toContain('expires: 2026-08-08');
        expect(content).toContain('# Lesson\n\nbody');
    });

    it('honors a custom horizon and re-stamps an existing expiry in place', () => {
        const now = new Date('2026-07-09T10:00:00.000Z');
        assertOk(stamp_finding_expiry({ storeDir: store, filename: 'finding-001.md', now: () => now }));
        assertOk(stamp_finding_expiry({ storeDir: store, filename: 'finding-001.md', now: () => now, days: 7 }));
        const content = readFileSync(join(store, 'finding-001.md'), 'utf8');
        expect(content).toContain('expires: 2026-07-16');
        expect(content.match(/expires:/g)).toHaveLength(1);
        expect(expiry_date(now, 7)).toBe('2026-07-16');
    });

    it('is an Err for an unreadable finding', () => {
        expect(assertErr(stamp_finding_expiry({ storeDir: store, filename: 'finding-nope.md' }))._tag).toBe(
            'finding_unreadable'
        );
    });

    it('is an Err when the stamp cannot be written (a read-only store)', () => {
        chmodSync(store, 0o555);
        try {
            expect(assertErr(stamp_finding_expiry({ storeDir: store, filename: 'finding-001.md' }))._tag).toBe(
                'store_write_failed'
            );
        } finally {
            chmodSync(store, 0o755);
        }
    });
});
