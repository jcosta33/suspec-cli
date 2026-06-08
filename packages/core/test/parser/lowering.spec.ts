import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';
import { RICH_OBLIGATION_SPEC, RICH_PATH } from './fixtures.ts';

// AC-002: lower each surface-keyword clause to its snake_case IR field.
describe('clause lowering (AC-002)', () => {
    it('keywords_to_snake_case', () => {
        const result = parseSpec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const ac1 = result.value.nodes.find((node) => node.id === 'AC-001');
        if (ac1 === undefined) {
            throw new Error('AC-001 not parsed');
        }
        expect(ac1.clauses.verify_by).toEqual(['test:cmdTest:t.spec.ts#persist']);
        expect(ac1.clauses.reads).toEqual(['config/app.json']);
        expect(ac1.clauses.writes).toEqual(['src/db/store.ts', 'src/db/index.ts']);
        expect(ac1.clauses.risk).toBe('high');

        // a block with none of the optional clauses lowers to empty/null, not undefined
        const ac2 = result.value.nodes.find((node) => node.id === 'AC-002');
        expect(ac2?.clauses.writes).toEqual([]);
        expect(ac2?.clauses.reads).toEqual([]);
        expect(ac2?.clauses.risk).toBeNull();
        expect(ac2?.clauses.verify_by).toEqual(['test:cmdTest:t.spec.ts#retry']);
    });
});
