import { describe, it, expect } from 'vitest';

import {
    reconcile_self_report,
    do_not_change_touched,
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
        expect(result.runSummaryUnparsed).toBe(false);
    });

    it('no machine-checkable claims + a non-empty diff → runSummaryUnparsed, the flood suppressed (#44)', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: [], // a prose Run summary parsed to nothing
            diffChangedFiles: ['src/x.ts', 'src/y.ts', 'vendor/z.ts'],
            affectedAreas: ['src'],
        });
        expect(result.runSummaryUnparsed).toBe(true);
        expect(result.inDiffNotClaimed).toEqual([]); // suppressed — not a 3-file flood
        expect(result.claimedNotInDiff).toEqual([]);
        expect(result.outsideScope).toEqual(['vendor/z.ts']); // outsideScope still computes
    });

    it('claims present → runSummaryUnparsed is false and inDiffNotClaimed still surfaces gaps (#44)', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: ['src/x.ts'],
            diffChangedFiles: ['src/x.ts', 'src/y.ts'],
            affectedAreas: ['src'],
        });
        expect(result.runSummaryUnparsed).toBe(false);
        expect(result.inDiffNotClaimed).toEqual(['src/y.ts']);
    });

    it('an empty diff (nothing changed) is never runSummaryUnparsed (#44)', () => {
        const result = reconcile_self_report({
            claimedChangedFiles: [],
            diffChangedFiles: [],
            affectedAreas: ['src'],
        });
        expect(result.runSummaryUnparsed).toBe(false);
        expect(result.inDiffNotClaimed).toEqual([]);
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

describe('do_not_change_touched (C014, ADR-0086)', () => {
    it('surfaces a changed file that matches a Do-not-change entry', () => {
        expect(do_not_change_touched(['src/auth/refresh.ts', 'src/auth/token.ts'], ['src/auth/token.ts'])).toEqual([
            'src/auth/token.ts',
        ]);
    });

    it('an empty Do-not-change list surfaces nothing (the inverse of affected-areas semantics)', () => {
        // The trap: is_under_any_area([]) returns true ("everything in scope"); matched per-entry, an
        // empty protected list must surface NOTHING, not everything.
        expect(do_not_change_touched(['anywhere/x.ts', 'src/y.ts'], [])).toEqual([]);
    });

    it('matches by path-segment boundary (a directory entry), not a bare string prefix', () => {
        expect(do_not_change_touched(['src/auth/x.ts', 'src/authfoo/y.ts'], ['src/auth'])).toEqual(['src/auth/x.ts']);
    });

    it('surfaces a protected file even when it is inside Affected areas — the fact outsideScope misses', () => {
        const protectedTouched = do_not_change_touched(['src/auth/token.ts'], ['src/auth/token.ts']);
        const outside = reconcile_self_report({
            claimedChangedFiles: [],
            diffChangedFiles: ['src/auth/token.ts'],
            affectedAreas: ['src/auth'], // the protected file is INSIDE the declared area
        }).outsideScope;
        expect(protectedTouched).toEqual(['src/auth/token.ts']);
        expect(outside).toEqual([]); // proves C014 and outsideScope are distinct facts
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
        verifyBlocks: [],
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

    it('flags status: pass with ZERO coverage rows as contradicted (a vacuous pass) (#32)', () => {
        expect(packet_structural_facts(packet({ status: 'pass', coverageRows: [] })).statusPassContradicted).toBe(
            true
        );
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
