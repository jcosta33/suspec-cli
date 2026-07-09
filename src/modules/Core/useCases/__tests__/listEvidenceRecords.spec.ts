import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { list_evidence_records } from '../listEvidenceRecords.ts';

// SPEC-suspec-v2 AC-010..013: the shared evidence reader — every *.md in evidence/<run>/, parsed
// leniently, sorted by name (capture order).

let store: string;

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-evlist-'));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('list_evidence_records', () => {
    it('is empty for a run with no evidence dir', () => {
        expect(list_evidence_records(store, 'feat')).toEqual([]);
    });

    it('lists records sorted by name, skipping raw captures and unreadable entries', () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, '002-b.md'), '---\ntype: evidence\nac: AC-002\nprovenance: agent\nexit: 0\n---\n');
        writeFileSync(join(dir, '001-a.md'), '---\ntype: evidence\nac: AC-001\nprovenance: cli-verified\nexit: 1\n---\n');
        writeFileSync(join(dir, '001-a.out'), 'raw output'); // not a record
        mkdirSync(join(dir, 'trap.md')); // a dir masquerading as a record — skipped

        const records = list_evidence_records(store, 'feat');
        expect(records.map((record) => record.filename)).toEqual(['001-a.md', '002-b.md']);
        expect(records[0]).toMatchObject({ ac: 'AC-001', provenance: 'cli-verified', exit: 1 });
        expect(records[1]).toMatchObject({ ac: 'AC-002', provenance: 'agent', exit: 0 });
    });
});
