import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';
import { RICH_OBLIGATION_SPEC, RICH_PATH } from './fixtures.ts';

// AC-003: every relationship is an entry in edges[], drawn from the closed edge types.
// I-001: a relationship appears once, as an edge — never also as a scalar field on a node.
describe('relationships as edges (AC-003 / I-001)', () => {
    it('relationships_are_edges', () => {
        const result = parseSpec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        expect(result.value.edges).toContainEqual({ from: 'AC-001', to: 'IF-001', type: 'depends_on', hard: true });
        expect(result.value.edges).toContainEqual({ from: 'AC-002', to: 'AC-001', type: 'affects', hard: false });
        // I-001 "exactly once": the fixture has exactly these two relationships — no duplicate, no spurious edge
        expect(result.value.edges).toHaveLength(2);
    });

    it('no_relationship_as_node_scalar', () => {
        const result = parseSpec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        // the relationship clauses must NOT be lowered onto the node (I-001) — edges[] is their only home
        for (const node of result.value.nodes) {
            expect(node).not.toHaveProperty('depends_on');
            expect(node).not.toHaveProperty('affects');
            expect(Object.keys(node.clauses)).toEqual(['verify_by', 'writes', 'reads', 'risk']);
        }
    });
});
