import { describe, it, expect } from 'vitest';
import { parseSpec } from '../../src/parser/index.ts';

// Adequacy tests added during adversarial self-review (ADR-0056) — the 1-of-each fixture left two holes:
// AC-001 never proved multiple same-kind blocks split, and the source-map hash check was circular (it
// recomputed over the parser's own reported span, so a wrong line_end would still match). These close both.

const MULTI_BLOCK_SPEC = `---
type: spec
id: multi-block
swarm_language: SOL/0.1
spec_version: 0.1.0
---

# Spec: multiple blocks of the same kind

## Obligations

REQ AC-001:
WHEN a happens
THE system MUST alpha
VERIFY BY test:cmdTest:t#a

REQ AC-002:
WHEN b happens
THE system MUST beta
VERIFY BY test:cmdTest:t#b

REQ AC-003:
WHEN c happens
THE system MUST gamma
VERIFY BY test:cmdTest:t#c

## Constraints

CONSTRAINT C-001:
THE system MUST NOT delta
BECAUSE reasons
VERIFY BY static:cmdTest:t#d
`;

describe('parser adequacy (AC-001 / AC-004 hardening)', () => {
    it('splits_multiple_same_kind_blocks', () => {
        const result = parseSpec({ source: MULTI_BLOCK_SPEC, path: 'multi.swarm.md' });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        // three distinct REQ nodes + one CONSTRAINT — adjacent same-kind blocks are not merged (F2)
        expect(result.value.nodes.map((node) => `${node.kind} ${node.id}`)).toEqual([
            'REQ AC-001',
            'REQ AC-002',
            'REQ AC-003',
            'CONSTRAINT C-001',
        ]);
    });

    it('block_spans_do_not_overlap_or_bleed', () => {
        const result = parseSpec({ source: MULTI_BLOCK_SPEC, path: 'multi.swarm.md' });
        if (!result.ok) {
            throw new Error('expected ok');
        }
        const spans = result.value.nodes.map((node) => node.source).sort((a, b) => a.line_start - b.line_start);
        // independent of the recorded hash: each block ends strictly before the next begins — catches a
        // line_end that bleeds into the following block (the gap the circular hash check could not see, F3)
        for (let index = 0; index + 1 < spans.length; index += 1) {
            expect(spans[index].line_end).toBeLessThan(spans[index + 1].line_start);
            expect(spans[index].line_end).toBeGreaterThanOrEqual(spans[index].line_start);
        }
    });
});
