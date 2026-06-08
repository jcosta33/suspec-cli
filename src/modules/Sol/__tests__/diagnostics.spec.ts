import { describe, it, expect } from 'vitest';

import { parse_spec } from '../useCases/parseSpec.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';

const head = `---
type: spec
id: diag-fixture
swarm_language: SOL/0.1
spec_version: 0.1.0
---

## Obligations
`;
const spec = (block: string): string => `${head}\n${block}\n`;

const codes = (source: string): string[] =>
    assertOk(parse_spec({ source, path: 'diag.swarm.md' })).diagnostics.map((diagnostic) => diagnostic.code);

// A clean obligation — the precision anchor (a detector that flags this is wrong).
const WELL_FORMED = spec(`REQ AC-001:
WHEN a request arrives
THE system MUST respond
VERIFY BY test:cmdTest:t#a`);

const S005_WRONG_PREFIX = spec(`REQ C-001:
THE system MUST respond
VERIFY BY test:cmdTest:t#a`);

const S003_NO_MODAL = spec(`REQ AC-001:
THE system responds to requests
VERIFY BY test:cmdTest:t#a`);

const S001_DANGLING = spec(`REQ AC-001:
WHEN the cache is cold
VERIFY BY test:cmdTest:t#a`);

const S006_SHOULD_NO_BECAUSE = spec(`REQ AC-001:
THE system SHOULD cache results
VERIFY BY test:cmdTest:t#a`);

const LOWERCASE_MODAL = spec(`REQ AC-001:
THE system should cache results
VERIFY BY test:cmdTest:t#a`);

describe('structural diagnostics (AC-005)', () => {
    it('illformed_blocks_emit_codes', () => {
        expect(codes(S005_WRONG_PREFIX)).toContain('SOL-S005');
        expect(codes(S003_NO_MODAL)).toContain('SOL-S003');
        expect(codes(S001_DANGLING)).toContain('SOL-S001');
        expect(codes(S006_SHOULD_NO_BECAUSE)).toContain('SOL-S006');

        // every emitted diagnostic is a well-formed S-layer BLOCKING record (not discarded, not a repair)
        const ir = assertOk(parse_spec({ source: S005_WRONG_PREFIX, path: 'diag.swarm.md' }));
        for (const diagnostic of ir.diagnostics) {
            expect(diagnostic.layer).toBe('S');
            expect(diagnostic.severity).toBe('BLOCKING');
            expect(diagnostic.code).toMatch(/^SOL-S\d{3}$/);
            expect(diagnostic.span.file).toBe('diag.swarm.md');
            expect(diagnostic.message.length).toBeGreaterThan(0);
        }
    });

    it('well_formed_spec_emits_no_diagnostics', () => {
        // the precision anchor: a valid obligation must not be flagged
        expect(codes(WELL_FORMED)).toEqual([]);
    });
});

describe('modal scan (C-003)', () => {
    it('ambiguous_modal_is_a_diagnostic_not_a_guess', () => {
        const ir = assertOk(parse_spec({ source: LOWERCASE_MODAL, path: 'diag.swarm.md' }));
        // a lowercase "should" is not a modal token: the parser reports SOL-S003 rather than guessing a split
        expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toContain('SOL-S003');
        // and it did not fabricate a binding from the non-modal: the node carries no risk/verify it invented
        const node = ir.nodes.find((candidate) => candidate.id === 'AC-001');
        expect(node?.clauses.verify_by).toEqual(['test:cmdTest:t#a']);
    });
});
