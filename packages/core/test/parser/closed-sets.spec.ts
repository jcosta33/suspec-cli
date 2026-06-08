import { describe, it, expect } from 'vitest';
import { parseSpec, BLOCK_KINDS, EDGE_TYPES } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH, RICH_OBLIGATION_SPEC, RICH_PATH } from './fixtures.ts';

// C-002: the parser never emits a block kind or edge type outside Swarm's closed sets.
describe('closed-set conformance (C-002)', () => {
    it('emitted_values_in_closed_sets', () => {
        for (const [source, path] of [
            [ALL_BLOCKS_SPEC, FIXTURE_PATH],
            [RICH_OBLIGATION_SPEC, RICH_PATH],
        ] as const) {
            const result = parseSpec({ source, path });
            if (!result.ok) {
                throw new Error('expected ok');
            }
            for (const node of result.value.nodes) {
                expect(BLOCK_KINDS).toContain(node.kind);
            }
            for (const edge of result.value.edges) {
                expect(EDGE_TYPES).toContain(edge.type);
            }
        }
    });
});
