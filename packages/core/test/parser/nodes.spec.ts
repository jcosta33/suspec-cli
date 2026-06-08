import { describe, it, expect } from 'vitest';
import { parseSpec, BLOCK_KINDS } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH } from './fixtures.ts';

// AC-001: one typed IR node per SOL block, each carrying a kind drawn from the seven closed block types.
describe('typed nodes (AC-001)', () => {
    it('one_node_per_block_typed', () => {
        const result = parseSpec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const { nodes } = result.value;

        // exactly the 7 blocks in the fixture, in source order, with their ids
        expect(nodes.map((node) => `${node.kind} ${node.id}`)).toEqual([
            'INTERFACE IF-001',
            'REQ AC-001',
            'CONSTRAINT C-001',
            'INVARIANT I-001',
            'QUESTION Q-001',
            'TRACE T-001',
            'VERDICT AC-001',
        ]);

        // every node's kind is a member of the closed set (no invented kinds)
        for (const node of nodes) {
            expect(BLOCK_KINDS).toContain(node.kind);
        }
    });
});
