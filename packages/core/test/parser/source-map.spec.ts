import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { parseSpec } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH } from './fixtures.ts';

const expectedHash = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

// AC-004: every node is source-mapped with its origin span and content hash.
describe('source mapping (AC-004)', () => {
    it('every_node_source_mapped', () => {
        const result = parseSpec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const lines = ALL_BLOCKS_SPEC.split('\n');

        for (const node of result.value.nodes) {
            const { source } = node;
            expect(source.file).toBe(FIXTURE_PATH);
            expect(source.line_start).toBeGreaterThanOrEqual(1);
            expect(source.line_end).toBeGreaterThanOrEqual(source.line_start);
            expect(source.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);

            // the recorded hash is the real digest of the recorded span (1-based, inclusive)
            const spanText = lines.slice(source.line_start - 1, source.line_end).join('\n');
            expect(source.content_hash).toBe(expectedHash(spanText));

            // the span's first line is the block's own header (it actually points at the block)
            expect(lines[source.line_start - 1]).toContain(node.id);
        }
    });
});
