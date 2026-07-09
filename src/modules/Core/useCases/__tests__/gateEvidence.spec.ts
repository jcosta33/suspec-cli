import { describe, it, expect } from 'vitest';

import { gate_evidence } from '../gateEvidence.ts';
import type { EvidenceRecord } from '../../services/evidenceArtifact.ts';

// SPEC-suspec-v2 AC-011/AC-012: the strict gate policy — cli-verified + exit 0 + non-stale per
// AC; agent evidence only under the flag; stale/failing/missing are gaps.

function record(overrides: Partial<EvidenceRecord>): EvidenceRecord {
    return {
        filename: '001-cmd.md',
        ac: 'AC-001',
        command: 'pnpm test:run',
        exit: 0,
        provenance: 'cli-verified',
        worktree: '/wt',
        worktreeDiffSha: 'fresh',
        captureFile: '001-cmd.out',
        captureBytes: 1,
        captureSha256: 'x',
        ...overrides,
    };
}

const REQ = [{ id: 'AC-001', verifyCommand: 'pnpm test:run' }];

function gate(records: EvidenceRecord[], options: { allowAgent?: boolean; stale?: (r: EvidenceRecord) => boolean; captureOk?: (r: EvidenceRecord) => boolean } = {}) {
    return gate_evidence({
        requirements: REQ,
        records,
        allowAgentEvidence: options.allowAgent ?? false,
        captureVerified: options.captureOk ?? (() => true),
        isStale: options.stale ?? (() => false),
    });
}

describe('gate_evidence', () => {
    it('verifies an AC with cli-verified, exit-0, non-stale evidence — no gaps', () => {
        const report = gate([record({})]);
        expect(report.gaps).toEqual([]);
        expect(report.rows).toEqual([
            {
                ac: 'AC-001',
                command: 'pnpm test:run',
                exit: 0,
                evidenceRef: '001-cmd.md',
                provenance: 'cli-verified',
                status: 'verified',
            },
        ]);
    });

    it('prefers the LATEST fresh passing record when several qualify', () => {
        const report = gate([record({ filename: '001-a.md' }), record({ filename: '002-b.md' })]);
        expect(report.rows[0].evidenceRef).toBe('002-b.md');
    });

    it('reads an AC with no evidence as missing — the spec\'s named Verify command fills the row', () => {
        const report = gate([]);
        expect(report.gaps).toHaveLength(1);
        expect(report.rows[0]).toMatchObject({ status: 'missing', command: 'pnpm test:run', evidenceRef: null });
    });

    it('marks drifted evidence stale — it does not satisfy the gate (AC-012)', () => {
        const report = gate([record({})], { stale: () => true });
        expect(report.rows[0].status).toBe('stale');
        expect(report.gaps).toHaveLength(1);
    });

    it('marks an AC whose only cli evidence failed as failing', () => {
        const report = gate([record({ exit: 2 })]);
        expect(report.rows[0].status).toBe('failing');
        expect(report.gaps).toHaveLength(1);
    });

    it('never counts a forged cli-verified claim (capture cross-check fails) — the AC reads missing', () => {
        const report = gate([record({})], { captureOk: () => false });
        expect(report.rows[0].status).toBe('missing');
        expect(report.gaps).toHaveLength(1);
    });

    it('counts agent evidence ONLY under --allow-agent-evidence, labeled verified-agent', () => {
        const agent = record({ provenance: 'agent', filename: '001-agent.md' });
        const blocked = gate([agent]);
        expect(blocked.rows[0].status).toBe('agent-blocked');
        expect(blocked.gaps).toHaveLength(1);

        const allowed = gate([agent], { allowAgent: true });
        expect(allowed.rows[0].status).toBe('verified-agent');
        expect(allowed.gaps).toEqual([]);
    });

    it('never counts dev provenance or a failing agent record, even under the flag', () => {
        const report = gate(
            [record({ provenance: 'dev' }), record({ provenance: 'agent', exit: 1, filename: '002-agent.md' })],
            { allowAgent: true }
        );
        expect(report.rows[0].status).toBe('missing');
    });

    it('a fresh cli record beats an allowed agent record', () => {
        const report = gate([record({ provenance: 'agent', filename: '001-agent.md' }), record({ filename: '002-cli.md' })], {
            allowAgent: true,
        });
        expect(report.rows[0]).toMatchObject({ status: 'verified', evidenceRef: '002-cli.md' });
    });

    it('refuses a no-op command tagged onto an AC with a named Verify command — command-mismatch, a gap', () => {
        const report = gate([record({ command: 'true' })]);
        expect(report.rows[0]).toMatchObject({ status: 'command-mismatch', evidenceRef: '001-cmd.md' });
        expect(report.gaps).toHaveLength(1);
    });

    it('accepts normalized containment in either direction (verify commands are prose-extracted)', () => {
        // Recorded command wraps the named one (env prefix + extra flag)…
        const wrapped = gate([record({ command: 'CI=1 pnpm test:run --coverage' })]);
        expect(wrapped.rows[0].status).toBe('verified');
        // …and the named Verify text wraps the recorded command (prose around it).
        const prose = gate_evidence({
            requirements: [{ id: 'AC-001', verifyCommand: 'run pnpm   test:run in the worktree' }],
            records: [record({ command: 'pnpm test:run' })],
            allowAgentEvidence: false,
            captureVerified: () => true,
            isStale: () => false,
        });
        expect(prose.rows[0].status).toBe('verified');
    });

    it('keeps the old any-command behavior for an AC whose Verify text names no command', () => {
        const report = gate_evidence({
            requirements: [{ id: 'AC-001', verifyCommand: null }],
            records: [record({ command: 'true' })],
            allowAgentEvidence: false,
            captureVerified: () => true,
            isStale: () => false,
        });
        expect(report.rows[0].status).toBe('verified');
        expect(report.gaps).toEqual([]);
    });

    it('prefers a matching record\'s real status over a mismatch row when both exist', () => {
        const report = gate([record({ command: 'true', filename: '001-true.md' }), record({ filename: '002-real.md' })]);
        expect(report.rows[0]).toMatchObject({ status: 'verified', evidenceRef: '002-real.md' });
    });
});
