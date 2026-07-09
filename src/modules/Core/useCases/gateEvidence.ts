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

// Does the recorded evidence command actually run the AC's named `Verify with:` command?
// Verify commands are PROSE-EXTRACTED from the spec — usually written `like this`. with markdown
// backticks and a sentence-ending period — so exact equality is far too brittle: the spec may say
// `pnpm test:run` while the capture recorded `CI=1 pnpm test:run --coverage`. Normalization
// (collapse whitespace, drop backticks, drop the trailing period) plus CONTAINMENT in either
// direction accepts those shapes while still refusing an unrelated command (`true`, `echo ok`)
// tagged onto the AC — without this check, `evidence add --ac AC-x -- true` satisfied any AC.
function normalize_command(text: string): string {
    return text
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\.$/, '')
        .trim();
}

function command_matches(recorded: string | null, verifyCommand: string): boolean {
    if (recorded === null) {
        return false;
    }
    const a = normalize_command(recorded);
    const b = normalize_command(verifyCommand);
    if (a.length === 0 || b.length === 0) {
        return false;
    }
    return a.includes(b) || b.includes(a);
}

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
        const cliAll = candidates.filter(
            (record) => record.provenance === 'cli-verified' && input.captureVerified(record)
        );
        // When the AC names a Verify command, only a record that ran it counts (command_matches);
        // an AC whose Verify text names no command keeps the old any-command behavior.
        const verify = requirement.verifyCommand;
        const cli =
            verify !== null && normalize_command(verify).length > 0
                ? cliAll.filter((record) => command_matches(record.command, verify))
                : cliAll;
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
        } else if (cliAll.length > 0) {
            // Capture-backed cli-verified evidence exists, but none of it ran the AC's named
            // Verify command — its own gap status, listed beside missing/stale in the digest.
            rows.push(row_for(requirement.id, cliAll[cliAll.length - 1], 'command-mismatch'));
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
