import { describe, it, expect } from 'vitest';

import { normalize_scalar } from '../yamlScalar.ts';

describe('normalize_scalar', () => {
    it('strips a surrounding double- or single-quote pair (the #38 root)', () => {
        expect(normalize_scalar('"ready"')).toBe('ready');
        expect(normalize_scalar("'draft'")).toBe('draft');
        expect(normalize_scalar('ready')).toBe('ready');
    });

    it('strips an unquoted trailing `# …` comment (the #33 root)', () => {
        expect(normalize_scalar('claude   # the primary agent')).toBe('claude');
        expect(normalize_scalar('ready # finalized')).toBe('ready');
    });

    it('strips a comment AND then a quote pair (the #33 case-3 ordering)', () => {
        expect(normalize_scalar('"claude"   # quoted, with a comment')).toBe('claude');
    });

    it('keeps a `#` that sits inside a quoted span', () => {
        expect(normalize_scalar('"claude #x"')).toBe('claude #x');
    });

    it('keeps a `#` with no preceding whitespace (a qualified id `SPEC-x#AC-001`)', () => {
        expect(normalize_scalar('SPEC-x#AC-001')).toBe('SPEC-x#AC-001');
    });

    it('preserves inner whitespace of a quoted scalar but trims the unquoted outer', () => {
        expect(normalize_scalar('  plain  ')).toBe('plain');
        expect(normalize_scalar('"  spaced  "')).toBe('  spaced  ');
    });

    it('is linear on a pathological long input (no backtracking)', () => {
        const big = `${'a'.repeat(200000)} # ${'b'.repeat(200000)}`;
        const start = Date.now();
        expect(normalize_scalar(big)).toBe('a'.repeat(200000));
        expect(Date.now() - start).toBeLessThan(500);
    });
});
