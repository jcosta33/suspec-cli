import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { scaffold_change_plan } from '../useCases/scaffoldChangePlan.ts';
import { isErr } from '../../../infra/errors/result.ts';

// The store-rooted change-plan scaffold (ADR-0137): `change-plan-<slug>.md` in the store,
// written atomically + grammar-stamped via write_store_artifact. The command-level flow
// (store resolution, clobber refusal, slug validation) is covered in Commands/new.spec.

let store: string;
beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-cp-'));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe('scaffold_change_plan', () => {
    it('writes the store artifact with the CHANGE id, grammar stamp, and the template sections', () => {
        const r = scaffold_change_plan({ storeDir: store, slug: 'db', title: 'DB', owner: 'me' });
        expect(isErr(r)).toBe(false);
        if (!isErr(r)) {
            expect(r.value.changePlanId).toBe('CHANGE-db');
            expect(r.value.path).toBe(join(store, 'change-plan-db.md'));
            const content = readFileSync(r.value.path, 'utf8');
            expect(content).toContain('grammar_version: 1');
            expect(content).toContain('owner: me');
            expect(content).toContain('## Rollback criteria');
        }
    });

    it('a failing store write surfaces the atomic-write error, leaving nothing behind', () => {
        const r = scaffold_change_plan({ storeDir: join(store, 'no-such-dir'), slug: 'x' });
        expect(isErr(r)).toBe(true);
        if (isErr(r)) {
            expect(r.error._tag).toBe('store_write_failed');
        }
    });
});
