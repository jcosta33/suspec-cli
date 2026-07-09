import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { purge_store } from '../useCases/purgeStore.ts';

// SPEC-suspec-v2 AC-020: the whole-store delete — the confirmation ceremony lives in the command;
// the engine removes exactly the dir it was handed, and purging twice is not an error.

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'suspec-purge-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('purge_store', () => {
    it('removes the store dir recursively and reports it', () => {
        const store = join(root, 'proj');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'spec-a.md'), 'x');
        writeFileSync(join(store, 'archive', 'run-b.md'), 'x');
        expect(assertOk(purge_store(store))).toEqual({ removed: store });
        expect(existsSync(store)).toBe(false);
        // A sibling store is untouched.
        expect(existsSync(root)).toBe(true);
    });

    it('an already-absent store purges as a no-op', () => {
        expect(assertOk(purge_store(join(root, 'never-there')))).toEqual({ removed: join(root, 'never-there') });
    });

    it('an undeletable store surfaces as an Err, not a crash', () => {
        const locked = join(root, 'locked');
        const store = join(locked, 'proj');
        mkdirSync(store, { recursive: true });
        writeFileSync(join(store, 'spec-a.md'), 'x');
        chmodSync(locked, 0o555); // the parent refuses the unlink
        try {
            const error = assertErr(purge_store(store));
            expect(error._tag).toBe('store_purge_failed');
        } finally {
            chmodSync(locked, 0o755);
        }
    });
});
