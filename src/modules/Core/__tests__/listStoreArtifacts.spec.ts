import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { list_store_artifacts } from '../useCases/listStoreArtifacts.ts';

// SPEC-suspec-v2 AC-020: `store list`'s read engine — root artifacts vs archive/, kind from the
// filename prefix, age in whole days from mtime.

let store: string;
const NOW = new Date('2026-07-08T12:00:00Z');

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-storelist-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('list_store_artifacts', () => {
    it('splits active (root *.md) from archived (any archive/ file), with kinds and ages', () => {
        writeFileSync(join(store, 'spec-feat.md'), 'x');
        writeFileSync(join(store, 'run-feat.md'), 'x');
        writeFileSync(join(store, 'weird.md'), 'x');
        writeFileSync(join(store, '.repo-path'), '/repo\n'); // dotfiles never list
        writeFileSync(join(store, 'raw.out'), 'x'); // non-md in the root never lists
        mkdirSync(join(store, 'evidence', 'feat'), { recursive: true });
        mkdirSync(join(store, 'archive'));
        writeFileSync(join(store, 'archive', 'finding-001.md'), 'x');
        const at = new Date(NOW.getTime() - 10.5 * 24 * 60 * 60 * 1000);
        utimesSync(join(store, 'archive', 'finding-001.md'), at, at);

        const listing = list_store_artifacts(store, NOW);
        expect(listing.active).toEqual([
            { filename: 'run-feat.md', kind: 'run', ageDays: 0 },
            { filename: 'spec-feat.md', kind: 'spec', ageDays: 0 },
            { filename: 'weird.md', kind: 'other', ageDays: 0 },
        ]);
        expect(listing.archived).toEqual([{ filename: 'finding-001.md', kind: 'finding', ageDays: 10 }]);
    });

    it('every storeLayout kind lists under its own name — task/intake/change-plan are never `other`', () => {
        writeFileSync(join(store, 'spec-x.md'), 'x');
        writeFileSync(join(store, 'task-x.md'), 'x');
        writeFileSync(join(store, 'run-x.md'), 'x');
        writeFileSync(join(store, 'review-x.md'), 'x');
        writeFileSync(join(store, 'intake-x.md'), 'x');
        writeFileSync(join(store, 'finding-001.md'), 'x');
        writeFileSync(join(store, 'change-plan-x.md'), 'x');

        const kinds = list_store_artifacts(store, NOW).active.map((a) => a.kind);
        expect([...kinds].sort()).toEqual(['change-plan', 'finding', 'intake', 'review', 'run', 'spec', 'task'].sort());
        expect(kinds).not.toContain('other');
    });

    it('a missing store dir (or archive/) reads empty', () => {
        expect(list_store_artifacts(join(store, 'nope'), NOW)).toEqual({ active: [], archived: [] });
        writeFileSync(join(store, 'intake-x.md'), 'x');
        expect(list_store_artifacts(store, NOW).archived).toEqual([]);
    });
});
