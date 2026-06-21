// ReconcileEngine — `swarm review` (M2, AC-018/019/020/021/023). The read-only diff-touching half of
// the reconcile engine: given a finished run's resolved inputs (the task packet, the source spec, the
// review packet if one exists, and the worktree's net change against its base), it mechanically
// reconciles WHAT WAS CLAIMED vs WHAT CHANGED vs WHAT THE SPEC REQUIRED, and returns the facts a human
// then judges. Writes nothing.
//
// The boundary is structural (ADR-0077 Decision 8, AC-023): ReviewReport carries the reconcile facts
// plus a single advisory `level`, and DELIBERATELY no Pass/Fail/Unverified/Blocked field and no
// merge/Suggested-decision field. The command resolves the run and reads the files; this engine takes
// the resolved data, so the same fixtures drive it without a worktree (the command's integration test
// covers the resolution path).

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import {
    coverage_facts,
    coverage_message,
    verify_binding_facts,
    verify_binding_message,
    type VerifyBindingFinding,
} from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import {
    reconcile_self_report,
    do_not_change_touched,
    scope_divergence,
    empty_evidence_pass_rows,
    packet_structural_facts,
    type SelfReportMismatch,
    type PacketStructuralFacts,
} from '../services/reconcileFacts.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type ReconcileReviewInput = Readonly<{
    task: string; // the resolved task id/slug (carried into the report for the human)
    taskPacketSource: string;
    specSource: string;
    // The review packet's markdown, or null when no review packet exists yet (every in-scope id then
    // reads uncovered, AC-019).
    reviewPacketSource: string | null;
    // The worktree's net change against its base branch (committed + uncommitted), name-only.
    diffChangedFiles: readonly string[];
    // Context the COMMAND surfaces; the reconcile engine ignores both. `base` is the diff base used, and
    // `packetRef` names where the self-report packet was read from (R5-I06). Optional so the pure-fixture
    // reconcile tests need not set them.
    base?: string;
    packetRef?: string;
}>;

// A coverage finding: an in-scope id with no row (uncovered) or a row naming an id absent from the
// spec (orphan), with its rendered message. Built from the structured C012 facts (no message
// re-parsing — the contract owns both the id/kind and the wording).
export type CoverageFinding = Readonly<{ id: string; kind: 'uncovered' | 'orphan'; message: string }>;

// A C013 verify-evidence-binding consistency fact (ADR-0083), with its rendered message. Built from
// the structured facts — the contract owns both the kind and the wording. A consistency fact, NOT a
// verdict and NOT proof a command ran (the fenced body is self-reported and unparsed).
export type VerifyBindingReport = Readonly<{ id: string; kind: VerifyBindingFinding['kind']; message: string }>;

export type ReviewReport = Readonly<{
    level: OutcomeLevel;
    task: string;
    diffChangedFiles: readonly string[];
    // C012 coverage facts (empty when the source spec is draft — the scope guard).
    coverage: readonly CoverageFinding[];
    // C013 verify-evidence-binding consistency facts (empty when the source spec is draft — the same
    // scope guard). A fact + the advisory level only; never a Result/status:pass/merge (ADR-0083).
    verifyBinding: readonly VerifyBindingReport[];
    // The scope↔spec divergence (scope ids the source spec does not define), AC-019 / D-R06.
    // Empty when the source spec is draft (the same scope guard as coverage).
    scopeDivergence: readonly string[];
    // The three self-report↔diff mismatch classes, AC-018.
    selfReport: SelfReportMismatch;
    // Changed files matching a task's `## Do not change` entry (C014, ADR-0086) — distinct from
    // selfReport.outsideScope, since a protected path may lie inside the declared Affected areas.
    doNotChangeTouched: readonly string[];
    // Coverage rows that are Pass with empty Evidence (read Unverified), AC-020.
    emptyEvidencePassRows: readonly string[];
    // The packet-structural facts, AC-021.
    packetStructural: PacketStructuralFacts;
    // Whether a review packet was present (false → every in-scope id reads uncovered).
    hasReviewPacket: boolean;
}>;

const EMPTY_PACKET_FACTS: PacketStructuralFacts = {
    badResultCells: [],
    badStatus: null,
    statusPassContradicted: false,
    missingSections: [],
};

// Any reconcile finding present → the advisory `warning` level (exit 1, AC-024). A clean reconcile →
// `clean` (exit 0). The engine never returns `blocking`: every reconcile fact is advisory, and a hard
// error is reserved for the command's Err arm (bad git / usage / no workspace).
function level_for(report: Omit<ReviewReport, 'level'>): OutcomeLevel {
    const hasFinding =
        report.coverage.length > 0 ||
        report.verifyBinding.length > 0 ||
        report.scopeDivergence.length > 0 ||
        report.selfReport.claimedNotInDiff.length > 0 ||
        report.selfReport.inDiffNotClaimed.length > 0 ||
        report.selfReport.outsideScope.length > 0 ||
        report.doNotChangeTouched.length > 0 ||
        report.emptyEvidencePassRows.length > 0 ||
        report.packetStructural.badResultCells.length > 0 ||
        report.packetStructural.badStatus !== null ||
        report.packetStructural.statusPassContradicted ||
        report.packetStructural.missingSections.length > 0;
    return hasFinding ? 'warning' : 'clean';
}

export function reconcile_review(input: ReconcileReviewInput): Result<ReviewReport, AppError> {
    const parsedSpec = parse_spec_record({ source: input.specSource, path: `${input.task}:spec` });
    if (isErr(parsedSpec)) {
        return err(
            createAppError('ReconcileFailed', `source spec does not parse: ${parsedSpec.error.message}`, {
                task: input.task,
            })
        );
    }
    const spec = parsedSpec.value;
    const packet = parse_task_packet(input.taskPacketSource);

    const specRequirementIds = spec.requirements.map((requirement) => requirement.id);
    const reviewPacket = input.reviewPacketSource !== null ? parse_review_packet(input.reviewPacketSource) : null;
    const coverageRowIds = reviewPacket !== null ? reviewPacket.coverageRows.map((row) => row.id) : [];

    // A migration task scopes its change plan's plan-local guarantee ids (`PG-NNN`, the form C010 assigns
    // to a preserved behavior with no spec id) alongside the spec ACs. Those are NOT spec requirements, so
    // the SPEC-keyed checks below (C012 coverage + scope↔spec divergence) must not flag them — doing so
    // false-fired "uncovered" + "scope≠spec" on every migration (R4-ISS-02 / R4-ISS-05). The change plan's
    // own checks (C010) verify the guarantees; the task review only owns the spec-requirement coverage.
    const specKeyedScope = packet.scope.filter((id) => !/^PG-\d+$/.test(id));

    const coverage: CoverageFinding[] = coverage_facts({
        sourceSpecStatus: spec.frontmatter.status,
        inScopeIds: specKeyedScope,
        specRequirementIds,
        coverageRowIds,
    }).map((finding) => ({ ...finding, message: coverage_message(finding) }));

    // C013 (ADR-0083): the named verify command lifted from each spec requirement, keyed by id, vs
    // the review packet's structured `verify` blocks against its Pass rows. A consistency fact, never
    // a verdict; the fenced body is unparsed (the parser never captured it).
    const namedCommandById = new Map<string, string | null>(
        spec.requirements.map((requirement) => [requirement.id, requirement.verifyCommand])
    );
    const verifyBinding: VerifyBindingReport[] =
        reviewPacket !== null
            ? verify_binding_facts({
                  sourceSpecStatus: spec.frontmatter.status,
                  namedCommandById,
                  coverageRows: reviewPacket.coverageRows,
                  verifyBlocks: reviewPacket.verifyBlocks,
              }).map((finding) => ({ ...finding, message: verify_binding_message(finding) }))
            : [];

    const selfReport = reconcile_self_report({
        claimedChangedFiles: packet.claimedChangedFiles,
        diffChangedFiles: input.diffChangedFiles,
        affectedAreas: packet.affectedAreas,
    });

    // C014 (ADR-0086): changed files touching a `## Do not change` entry. Not draft-guarded — it
    // reconciles task-packet intent against the diff, independent of the spec's draft status.
    const doNotChangeTouched = do_not_change_touched(input.diffChangedFiles, packet.doNotChange);

    const packetStructural =
        reviewPacket !== null ? packet_structural_facts(reviewPacket) : EMPTY_PACKET_FACTS;
    const emptyEvidencePassRows = reviewPacket !== null ? empty_evidence_pass_rows(reviewPacket.coverageRows) : [];

    const withoutLevel: Omit<ReviewReport, 'level'> = {
        task: input.task,
        diffChangedFiles: [...input.diffChangedFiles],
        coverage,
        verifyBinding,
        // Draft-guarded like coverage (ADR-0079): a draft spec's ids are work-in-progress, so a
        // scope-vs-spec id mismatch is not yet a finalized divergence to surface.
        scopeDivergence:
            spec.frontmatter.status === 'draft' ? [] : scope_divergence(specKeyedScope, specRequirementIds),
        selfReport,
        doNotChangeTouched,
        emptyEvidencePassRows,
        packetStructural,
        hasReviewPacket: reviewPacket !== null,
    };

    return ok({ level: level_for(withoutLevel), ...withoutLevel });
}
