import { describe, it, expect } from 'vitest';

import {
    reconcile_self_report,
    scope_divergence,
    empty_evidence_pass_rows,
    packet_structural_facts,
    type CoverageRow,
    type ReviewPacket,
} from '../services/reconcileFacts.ts';

describe('reconcile_self_report — the three mismatch classes (AC-018)', () => {
    it('surfaces claimed-not-in-diff, in-diff-not-claimed, and outside-scope', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: ['a.ts'], // claimed but unchanged
            diffChangedFiles: ['b.ts', 'src/x.ts', 'vendor/x.ts'], // b.ts omitted from claim
            affectedAreas: ['src'], // vendor/x.ts is outside
        });
        expect(result.claimedNotInDiff).toEqual(['a.ts']);
        expect(result.inDiffNotClaimed).toEqual(['b.ts', 'src/x.ts', 'vendor/x.ts']);
        expect(result.outsideScope).toEqual(['b.ts', 'vendor/x.ts']);
    });

    it('agreement yields no mismatch (a.ts claimed, a.ts changed, both in scope)', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: ['src/a.ts'],
            diffChangedFiles: ['src/a.ts'],
            affectedAreas: ['src/a.ts'],
        });
        expect(result.claimedNotInDiff).toEqual([]);
        expect(result.inDiffNotClaimed).toEqual([]);
        expect(result.outsideScope).toEqual([]);
    });

    it('with no declared Affected areas, nothing is outside scope', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: [],
            diffChangedFiles: ['anywhere/x.ts'],
            affectedAreas: [],
        });
        expect(result.outsideScope).toEqual([]);
    });

    it('a directory area matches files beneath it but not a sibling prefix', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: [],
            diffChangedFiles: ['src/x.ts', 'srcfoo/y.ts'],
            affectedAreas: ['src'],
        });
        // src/x.ts is under `src`; srcfoo/y.ts is NOT (a path-segment boundary, not a string prefix).
        expect(result.outsideScope).toEqual(['srcfoo/y.ts']);
    });

    it('an area already ending in a slash, and an exact-path area, both match', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: [],
            diffChangedFiles: ['src/x.ts', 'docs/y.md', 'other/z.ts'],
            affectedAreas: ['src/', 'docs/y.md'], // trailing-slash dir + exact-path file
        });
        expect(result.outsideScope).toEqual(['other/z.ts']);
    });
});

describe('scope_divergence (AC-019 / D-R06)', () => {
    it('surfaces scope ids the spec does not define', () => {
        expect(scope_divergence(['AC-001', 'AC-009'], ['AC-001', 'AC-002'])).toEqual(['AC-009']);
    });
    it('no divergence when scope is a subset of the spec', () => {
        expect(scope_divergence(['AC-001'], ['AC-001', 'AC-002'])).toEqual([]);
    });
});

const row = (id: string, result: string, evidence = 'x'): CoverageRow => ({ id, result, evidence });

describe('empty_evidence_pass_rows (AC-020)', () => {
    it('flags a Pass row with empty evidence, not one carrying output', () => {
        expect(empty_evidence_pass_rows([row('AC-001', 'Pass', ''), row('AC-002', 'Pass', 'pasted')])).toEqual([
            'AC-001',
        ]);
    });
    it('does not flag a non-Pass row with empty evidence', () => {
        expect(empty_evidence_pass_rows([row('AC-001', 'Unverified', '')])).toEqual([]);
    });
});

describe('packet_structural_facts (AC-021)', () => {
    const packet = (over: Partial<ReviewPacket>): ReviewPacket => ({
        status: 'needs-human',
        sectionTitles: ['Summary', 'Changed files', 'Requirement coverage', 'Human attention', 'Suggested decision'],
        coverageRows: [],
        ...over,
    });

    it('a well-formed packet surfaces no structural fact', () => {
        expect(packet_structural_facts(packet({ coverageRows: [row('AC-001', 'Pass')] }))).toEqual({
            badResultCells: [],
            badStatus: null,
            statusPassContradicted: false,
            missingSections: [],
        });
    });

    it('flags a Result outside the closed set', () => {
        expect(packet_structural_facts(packet({ coverageRows: [row('AC-001', 'Maybe')] })).badResultCells).toEqual([
            'AC-001',
        ]);
    });

    it('flags a frontmatter status outside the closed set', () => {
        expect(packet_structural_facts(packet({ status: 'merged' })).badStatus).toBe('merged');
    });

    it('flags status: pass contradicted by a non-Pass row', () => {
        expect(
            packet_structural_facts(packet({ status: 'pass', coverageRows: [row('AC-001', 'Fail')] }))
                .statusPassContradicted
        ).toBe(true);
    });

    it('flags a missing required section', () => {
        expect(
            packet_structural_facts(
                packet({ sectionTitles: ['Summary', 'Changed files', 'Requirement coverage', 'Suggested decision'] })
            ).missingSections
        ).toEqual(['Human attention']);
    });

    it('a null status is not flagged as a bad status', () => {
        expect(packet_structural_facts(packet({ status: null })).badStatus).toBeNull();
    });
});
