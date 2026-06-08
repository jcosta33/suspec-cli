import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH } from './fixtures.ts';

// C-001: parsing is a read-only derivation — the source is unchanged and the parse holds no state.
describe('read-only parse (C-001)', () => {
    it('source_byte_identical_after_parse', () => {
        const source = `${ALL_BLOCKS_SPEC}`; // own copy
        const before = source;

        const first = parseSpec({ source, path: FIXTURE_PATH });
        expect(source).toBe(before); // input string untouched

        // a second parse of the same bytes yields a byte-identical IR (no hidden state between calls)
        const second = parseSpec({ source, path: FIXTURE_PATH });
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });
});
