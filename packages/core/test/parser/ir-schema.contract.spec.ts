import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';
import { ALL_BLOCKS_SPEC, FIXTURE_PATH } from './fixtures.ts';

// IF-002: SwarmIr = { meta, nodes[], edges[], diagnostics[], provenance }.
describe('SwarmIr shape (IF-002)', () => {
    it('ir_matches_schema', () => {
        const result = parseSpec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const ir = result.value;

        expect(Object.keys(ir).sort()).toEqual(['diagnostics', 'edges', 'meta', 'nodes', 'provenance']);

        expect(ir.meta).toEqual({ id: 'fixture-all-blocks', language: 'SOL/0.1', spec_version: '0.1.0' });

        expect(Array.isArray(ir.nodes)).toBe(true);
        expect(Array.isArray(ir.edges)).toBe(true);
        expect(Array.isArray(ir.diagnostics)).toBe(true);

        // provenance carries the three tool-emitted fields; emitted_at is null (no clock injected).
        expect(Object.keys(ir.provenance).sort()).toEqual(['emitted_at', 'hash', 'tool_version']);
        expect(ir.provenance.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(ir.provenance.tool_version).toBe('swarm-core-parser/0.1.0');
        expect(ir.provenance.emitted_at).toBeNull();
    });
});
