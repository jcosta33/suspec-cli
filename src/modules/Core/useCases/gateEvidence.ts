// The strict evidence gate (SPEC-suspec-v2 AC-011/AC-012): every AC in the driving spec must map
// to at least one cli-verified, exit-0, non-stale evidence record. PURE over the parsed records —
// the capture cross-check and the staleness recompute come in as predicates (the fs/git edges),
// so the policy table is testable in isolation. Non-cli-verified evidence counts only under
// `--allow-agent-evidence` (and is labeled `verified-agent` in the digest); a stale, failing, or
// missing AC is a GAP — the caller blocks (exit 1) unless `--accept-failing` stamps a reason.
// No verdict is issued here: the rows are facts; the exit policy lives in the command.

import type { DigestRow } from '../services/doneDigest.ts';
import type { EvidenceRecord } from '../services/evidenceArtifact.ts';

export type GateRequirement = Readonly<{ id: string; verifyCommand: string | null }>;

export type GateEvidenceInput = Readonly<{
    requirements: readonly GateRequirement[];
    records: readonly EvidenceRecord[];
    allowAgentEvidence: boolean;
    // Does this record's capture block back its cli-verified claim? (verify_evidence_capture)
    captureVerified: (record: EvidenceRecord) => boolean;
    // Has the worktree drifted since this record was captured? (AC-012 recompute)
    isStale: (record: EvidenceRecord) => boolean;
}>;

export type GateReport = Readonly<{
    rows: readonly DigestRow[];
    gaps: readonly DigestRow[]; // the rows that do not satisfy the gate
}>;

function row_for(ac: string, record: EvidenceRecord, status: DigestRow['status']): DigestRow {
    return {
        ac,
        command: record.command,
        exit: record.exit,
        evidenceRef: record.filename,
        provenance: record.provenance,
        status,
    };
}

export function gate_evidence(input: GateEvidenceInput): GateReport {
    const rows: DigestRow[] = [];
    for (const requirement of input.requirements) {
        const candidates = input.records.filter((record) => record.ac === requirement.id);
        // Only a capture-backed record is cli-verified in fact — a forged claim never counts (AC-010).
        const cli = candidates.filter(
            (record) => record.provenance === 'cli-verified' && input.captureVerified(record)
        );
        const cliPassing = cli.filter((record) => record.exit === 0);
        const fresh = cliPassing.filter((record) => !input.isStale(record));
        const agentPassing = candidates.filter((record) => record.provenance === 'agent' && record.exit === 0);

        if (fresh.length > 0) {
            rows.push(row_for(requirement.id, fresh[fresh.length - 1], 'verified'));
        } else if (input.allowAgentEvidence && agentPassing.length > 0) {
            rows.push(row_for(requirement.id, agentPassing[agentPassing.length - 1], 'verified-agent'));
        } else if (cliPassing.length > 0) {
            rows.push(row_for(requirement.id, cliPassing[cliPassing.length - 1], 'stale'));
        } else if (cli.length > 0) {
            rows.push(row_for(requirement.id, cli[cli.length - 1], 'failing'));
        } else if (agentPassing.length > 0) {
            rows.push(row_for(requirement.id, agentPassing[agentPassing.length - 1], 'agent-blocked'));
        } else {
            rows.push({
                ac: requirement.id,
                command: requirement.verifyCommand,
                exit: null,
                evidenceRef: null,
                provenance: null,
                status: 'missing',
            });
        }
    }
    return {
        rows,
        gaps: rows.filter((row) => row.status !== 'verified' && row.status !== 'verified-agent'),
    };
}
