import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolve_canon_root } from '../resolveCanonRoot.ts';

const originalCanon = process.env.SUSPEC_CANON;

afterEach(() => {
    if (originalCanon === undefined) {
        delete process.env.SUSPEC_CANON;
    } else {
        process.env.SUSPEC_CANON = originalCanon;
    }
});

describe('resolve_canon_root', () => {
    it('fails closed when an explicit integration root lacks the checks contract', () => {
        process.env.SUSPEC_CANON = join(tmpdir(), 'missing-suspec-canon');
        expect(() => resolve_canon_root(process.cwd())).toThrow(/does not contain checks\/checks\.yaml/);
    });

    it('accepts an explicit root carrying the checks contract', () => {
        const root = mkdtempSync(join(tmpdir(), 'suspec-canon-'));
        try {
            mkdirSync(join(root, 'checks'));
            writeFileSync(join(root, 'checks', 'checks.yaml'), 'version: 0.18.0\n');
            process.env.SUSPEC_CANON = root;
            expect(resolve_canon_root(process.cwd())).toBe(root);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
