import { describe, it, expect } from 'vitest';
import { parseSpec, BLOCK_KINDS, type BlockKind } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH } from './fixtures.ts';

// IF-001: parseSpec reads a *.swarm.md source and yields a typed IR (or a ParseFailure).
describe('parseSpec (IF-001)', () => {
    it('parses_seven_block_types', () => {
        const result = parseSpec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
        }
        const kinds = result.value.nodes.map((node) => node.kind);
        // one node per block; all seven closed kinds present
        expect(result.value.nodes).toHaveLength(7);
        for (const kind of BLOCK_KINDS as readonly BlockKind[]) {
            expect(kinds).toContain(kind);
        }
    });

    it('returns_unparseable_frontmatter_when_no_fence', () => {
        const result = parseSpec({ source: '# no frontmatter here\n\nREQ AC-001:\nTHE x MUST y\n', path: 'bad.md' });
        expect(result.ok).toBe(false);
        if (result.ok) {
            throw new Error('expected a ParseFailure');
        }
        expect(result.error.code).toBe('unparseable-frontmatter');
    });
});
