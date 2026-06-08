import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH, RICH_OBLIGATION_SPEC, RICH_PATH } from './fixtures.ts';

// I-002: every VERIFY BY binding present in the source is recoverable from the IR (lossless for binding content).
const sourceBindings = (source: string): string[] =>
    source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('VERIFY BY '))
        .map((line) => line.slice('VERIFY BY '.length).trim());

describe('lossless lowering (I-002)', () => {
    it.each([
        ['all-blocks', ALL_BLOCKS_SPEC, FIXTURE_PATH],
        ['rich', RICH_OBLIGATION_SPEC, RICH_PATH],
    ])('source_obligations_recoverable_from_ir [%s]', (_name, source, path) => {
        const result = parseSpec({ source, path });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const recovered = new Set(result.value.nodes.flatMap((node) => node.clauses.verify_by));
        const inSource = sourceBindings(source);
        expect(inSource.length).toBeGreaterThan(0);
        for (const binding of inSource) {
            expect(recovered).toContain(binding);
        }
    });
});
