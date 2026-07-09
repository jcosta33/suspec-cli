import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { store_decay_summary, decay_line } from '../useCases/storeDecaySummary.ts';

// SPEC-suspec-v2 AC-019: the decay scan — expired keeps, dead-heartbeat live runs, past-retention
// archive — and the one-line surface hook.

let store: string;
const NOW = new Date('2026-07-08T12:00:00Z');

function old_mtime(path: string, daysAgo: number): void {
    const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    utimesSync(path, at, at);
}

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-decay-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('store_decay_summary', () => {
    it('an empty / missing store decays nothing (and decay_line is null)', () => {
        const summary = store_decay_summary(store, { now: NOW });
        expect(summary).toEqual({ expiredFindings: 0, staleRuns: 0, pastRetentionArchived: 0, total: 0 });
        expect(decay_line(summary)).toBeNull();
        expect(store_decay_summary(join(store, 'nope'), { now: NOW }).total).toBe(0);
    });

    it('counts a finding whose expires date passed; a future or unparseable date does not count', () => {
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nexpires: 2026-07-01\n---\n# a\n');
        writeFileSync(join(store, 'finding-002.md'), '---\ntype: finding\nexpires: 2027-01-01\n---\n# b\n');
        writeFileSync(join(store, 'finding-003.md'), '---\ntype: finding\nexpires: not-a-date\n---\n# c\n');
        writeFileSync(join(store, 'finding-004.md'), '---\ntype: finding\n---\n# unstamped\n');
        const summary = store_decay_summary(store, { now: NOW });
        expect(summary.expiredFindings).toBe(1);
        expect(summary.total).toBe(1);
    });

    it('counts a live run with a dead heartbeat; a fresh heartbeat and an exited run do not count', () => {
        writeFileSync(
            join(store, 'run-dead.md'),
            '---\ntype: run\nstatus: live\nheartbeat: 2026-07-08T10:00:00Z\n---\n'
        );
        writeFileSync(
            join(store, 'run-fresh.md'),
            `---\ntype: run\nstatus: live\nheartbeat: ${NOW.toISOString()}\n---\n`
        );
        writeFileSync(join(store, 'run-done.md'), '---\ntype: run\nstatus: exited\n---\n');
        expect(store_decay_summary(store, { now: NOW }).staleRuns).toBe(1);
    });

    it('counts archive items past retention (default 30d, override honored); skips subdirs + races', () => {
        mkdirSync(join(store, 'archive', 'nested'), { recursive: true });
        writeFileSync(join(store, 'archive', 'finding-old.md'), 'x');
        writeFileSync(join(store, 'archive', 'finding-new.md'), 'x');
        old_mtime(join(store, 'archive', 'finding-old.md'), 45);
        old_mtime(join(store, 'archive', 'finding-new.md'), 2);
        expect(store_decay_summary(store, { now: NOW }).pastRetentionArchived).toBe(1);
        expect(store_decay_summary(store, { now: NOW, retentionDays: 60 }).pastRetentionArchived).toBe(0);
        expect(store_decay_summary(store, { now: NOW, retentionDays: 1 }).pastRetentionArchived).toBe(2);
    });

    it('skips a dir masquerading as an artifact, and sums the buckets into decay_line', () => {
        mkdirSync(join(store, 'finding-dir.md'));
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nexpires: 2026-07-01\n---\n');
        writeFileSync(
            join(store, 'run-dead.md'),
            '---\ntype: run\nstatus: live\nheartbeat: 2026-07-08T09:00:00Z\n---\n'
        );
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'run-old.md'), 'x');
        old_mtime(join(store, 'archive', 'run-old.md'), 90);
        const summary = store_decay_summary(store, { now: NOW });
        expect(summary.total).toBe(3);
        expect(decay_line(summary)).toBe('3 stale — suspec store doctor');
    });
});
