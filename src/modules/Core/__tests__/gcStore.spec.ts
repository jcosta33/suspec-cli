import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { gc_store } from '../useCases/gcStore.ts';

// SPEC-suspec-v2 AC-020: gc deletes ONLY archive/ items past retention — the store root and
// everything inside retention are untouchable.

let store: string;
const NOW = new Date('2026-07-08T12:00:00Z');

function aged(path: string, daysAgo: number): void {
    writeFileSync(path, 'content');
    const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    utimesSync(path, at, at);
}

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-gc-'));
    mkdirSync(join(store, 'archive'));
});
afterEach(() => {
    if (existsSync(join(store, 'archive'))) {
        chmodSync(join(store, 'archive'), 0o755);
    }
    rmSync(store, { recursive: true, force: true });
});

describe('gc_store', () => {
    it('deletes only archive/ items older than retention, reporting name + age', () => {
        aged(join(store, 'spec-root.md'), 100); // root: NEVER gc'd, however old
        aged(join(store, 'archive', 'finding-old.md'), 45);
        aged(join(store, 'archive', 'run-fresh.md'), 5);
        mkdirSync(join(store, 'archive', 'nested')); // a subdir is not an item
        const report = assertOk(gc_store({ storeDir: store, retentionDays: 30, now: NOW }));
        expect(report.deleted).toEqual([{ filename: 'finding-old.md', ageDays: 45 }]);
        expect(existsSync(join(store, 'spec-root.md'))).toBe(true);
        expect(readdirSync(join(store, 'archive')).sort()).toEqual(['nested', 'run-fresh.md']);
    });

    it('a longer retention keeps everything; a missing archive/ is a clean no-op', () => {
        aged(join(store, 'archive', 'finding-old.md'), 45);
        expect(assertOk(gc_store({ storeDir: store, retentionDays: 60, now: NOW })).deleted).toEqual([]);
        rmSync(join(store, 'archive'), { recursive: true });
        expect(assertOk(gc_store({ storeDir: store, retentionDays: 30, now: NOW })).deleted).toEqual([]);
    });

    it('an undeletable item surfaces as an Err, not a crash', () => {
        aged(join(store, 'archive', 'finding-old.md'), 45);
        chmodSync(join(store, 'archive'), 0o555);
        const error = assertErr(gc_store({ storeDir: store, retentionDays: 30, now: NOW }));
        expect(error._tag).toBe('store_gc_failed');
    });

    it('sweeps day-old atomic-write crash turds (.<name>.tmp-*) from the root AND archive/, sparing fresh ones', () => {
        aged(join(store, '.spec-x.md.tmp-123-abcd'), 2); // a crash turd in the root
        aged(join(store, 'archive', '.finding-y.md.tmp-99-beef'), 3); // …and one in archive/
        aged(join(store, '.run-z.md.tmp-4-feed'), 0); // fresh — may belong to a write in flight
        aged(join(store, 'spec-real.md'), 90); // a REAL root artifact is never touched
        const report = assertOk(gc_store({ storeDir: store, retentionDays: 30, now: NOW }));
        expect([...report.sweptTmp].sort()).toEqual(['.finding-y.md.tmp-99-beef', '.spec-x.md.tmp-123-abcd']);
        expect(existsSync(join(store, '.run-z.md.tmp-4-feed'))).toBe(true);
        expect(existsSync(join(store, 'spec-real.md'))).toBe(true);
        // Turds are not counted as retention deletions.
        expect(report.deleted).toEqual([]);
    });
});
