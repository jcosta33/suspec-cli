// ReconcileEngine — `suspec review` (M2, AC-018/019/020/021/023). The read-only diff-touching half of
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
    packet_size_facts,
    spec_coverage_drift_facts,
    spec_coverage_drift_message,
    type VerifyBindingFinding,
    type ChangedFileStat,
    type PacketSizeFacts,
} from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import {
    reconcile_self_report,
    do_not_change_touched,
    scope_divergence,
    empty_evidence_pass_rows,
    packet_structural_facts,
    evidence_digest,
    type SelfReportMismatch,
    type PacketStructuralFacts,
} from '../services/reconcileFacts.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type ReconcileReviewInput = Readonly<{
    task: string; // the resolved task id/slug (carried into the report for the human), or the spec id (no-task)
    // The task packet markdown, or null for the task-less 1:1 review (ADR-0103 review-to-spec): coverage
    // then keys on the spec's full ACs and the self-report is read from the spec's `## Execution`.
    taskPacketSource: string | null;
    specSource: string;
    // The review packet's markdown, or null when no review packet exists yet (every in-scope id then
    // reads uncovered, AC-019).
    reviewPacketSource: string | null;
    // The worktree's net change against its base branch (committed + uncommitted), name-only.
    diffChangedFiles: readonly string[];
    // Per-file LOC of the committed diff (the oversized-packet ADVISORY — deliberately not a minted C-code; C018 is reserved for it (ADR-0094/0097)). Optional: the size nudge is advisory,
    // so a fixture reconcile (no git) or a numstat hiccup simply omits it — no size finding then.
    changedFileStats?: readonly ChangedFileStat[];
    // Context the COMMAND surfaces; the reconcile engine ignores both. `base` is the diff base used, and
    // `packetRef` names where the self-report packet was read from (R5-I06). Optional so the pure-fixture
    // reconcile tests need not set them.
    base?: string;
    packetRef?: string;
    // #97 (ADR-0107): an injected git predicate — the paths that differ between a SHA and the worktree
    // (`paths_changed_since`). Used to detect post-review CONTENT drift the evidence digest misses (the
    // digest hashes the diff's path SET + evidence cells, not the diff content). Optional and injected
    // (like C009's `exists` / C010's `spec_ref_resolves`) so the engine stays pure; when absent, staleness
    // degrades to digest-only — the prior behavior.
    pathsChangedSince?: (sha: string) => readonly string[] | null;
}>;

// A coverage finding: an in-scope id with no row (uncovered) or a row naming an id absent from the
// spec (orphan), with its rendered message. Built from the structured C012 facts (no message
// re-parsing — the contract owns both the id/kind and the wording).
export type CoverageFinding = Readonly<{ id: string; kind: 'uncovered' | 'orphan'; message: string }>;

// A C013 verify-evidence-binding consistency fact (ADR-0083), with its rendered message. Built from
// the structured facts — the contract owns both the kind and the wording. A consistency fact, NOT a
// verdict and NOT proof a command ran (the fenced body is self-reported and unparsed).
export type VerifyBindingReport = Readonly<{ id: string; kind: VerifyBindingFinding['kind']; message: string }>;

// The spec-coverage drift fact with its rendered message (suspec-cli#1). Structured for `--json` plus
// the single-sourced wording (the contract owns it via spec_coverage_drift_message), so the renderer
// displays rather than re-derives — the same engine-attaches-the-message pattern as CoverageFinding.
export type SpecCoverageDriftReport = Readonly<{
    specCount: number;
    trackedCount: number;
    untracked: readonly string[];
    message: string;
}>;

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
    // The diff size (changed LOC + files-touched, generated/vendored excluded), or null when no diff
    // stats were available (a fixture reconcile). NEUTRAL INFO the reviewer judges — never a finding;
    // the band-based oversized-packet check is specified-not-shipped (ADR-0097, measured FP).
    packetSize: PacketSizeFacts | null;
    // Spec-coverage drift (private workspace #72 item 2; suspec-cli#1): the source spec's requirement ids the
    // task `scope` does not track — "the spec grew under the task". NEUTRAL INFO, not a finding: it does
    // NOT raise the advisory level (mirrors packetSize), and it is reconcile-only — no C-id, no
    // checks.yaml entry — until measured 0-FP and promoted (honesty framework, ADR-0063). null when the
    // spec is fully tracked, has no ids, or is draft (the scope guard lives in the contract). The
    // review-vs-spec face (spec grew beyond the review's coverage rows) follows with the no-task keying.
    specCoverageDrift: SpecCoverageDriftReport | null;
    // Fast-track staleness (ADR-0107). evidenceDigest is the CURRENT digest over the diff + the
    // coverage rows' evidence — the value a reviewer stamps as `evidence_hash:` when finalizing (read it
    // off `--json`). reviewStale is set when the packet carries a stored `evidence_hash:` that no longer
    // matches — the diff or the cited evidence moved, so the prior review is `Stale` and re-routes to
    // re-review. Stale RAISES the advisory level (a warning), never blocks (detection, not a verdict).
    evidenceDigest: string;
    reviewStale: { reviewedSha: string | null } | null;
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

// The backtick-wrapped paths under a `## <section>` heading of the spec — path-shaped tokens only (a
// slash or a dot-extension, never a `{{placeholder}}`). Used in the task-less case to read the spec's
// declared `## Affected areas` and the implementer's self-reported changed files from `## Execution`.
function backtick_paths_in_section(source: string, sectionName: RegExp): string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
        const heading = /^##\s+(.*\S)\s*$/.exec(line);
        if (heading !== null) {
            inSection = sectionName.test(heading[1].trim());
            continue;
        }
        if (!inSection) {
            continue;
        }
        for (const match of line.matchAll(/`([^`]+)`/g)) {
            const path = match[1].trim();
            if (!path.includes('{{') && (path.includes('/') || /\.\w+$/.test(path))) {
                out.push(path);
            }
        }
    }
    return out;
}

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
        report.packetStructural.missingSections.length > 0 ||
        // Fast-track staleness (ADR-0107): a Stale packet warns + re-routes to re-review.
        report.reviewStale !== null;
    // NOTE: packetSize + specCoverageDrift are deliberately NOT findings — neutral info the reviewer
    // judges (the oversized band is specified-not-shipped, ADR-0097). reviewStale IS a finding (warns).
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
    const specRequirementIds = spec.requirements.map((requirement) => requirement.id);

    // The scope + self-report come from the task packet when there is one (the slice case), else from the
    // spec itself (the task-less 1:1 case, ADR-0103): scope = the spec's full ACs, the claimed changed
    // files = the spec's `## Execution` self-report, the declared areas = the spec's `## Affected areas`,
    // and there is no `## Do not change` list (that is a task-only construct).
    const packetData =
        input.taskPacketSource !== null
            ? ((p) => ({
                  scope: p.scope,
                  claimedChangedFiles: p.claimedChangedFiles,
                  affectedAreas: p.affectedAreas,
                  doNotChange: p.doNotChange,
              }))(parse_task_packet(input.taskPacketSource))
            : {
                  scope: specRequirementIds,
                  claimedChangedFiles: backtick_paths_in_section(input.specSource, /^execution$/i),
                  affectedAreas: backtick_paths_in_section(input.specSource, /^affected areas$/i),
                  doNotChange: [] as readonly string[],
              };

    const reviewPacket = input.reviewPacketSource !== null ? parse_review_packet(input.reviewPacketSource) : null;
    const coverageRowIds = reviewPacket !== null ? reviewPacket.coverageRows.map((row) => row.id) : [];

    // A migration task scopes its change plan's plan-local guarantee ids (`PG-NNN`, the form C010 assigns
    // to a preserved behavior with no spec id) alongside the spec ACs. Those are NOT spec requirements, so
    // the SPEC-keyed checks below (C012 coverage + scope↔spec divergence) must not flag them — doing so
    // false-fired "uncovered" + "scope≠spec" on every migration (R4-ISS-02 / R4-ISS-05). The change plan's
    // own checks (C010) verify the guarantees; the task review only owns the spec-requirement coverage.
    const specKeyedScope = packetData.scope.filter((id) => !/^PG-\d+$/.test(id));

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
        claimedChangedFiles: packetData.claimedChangedFiles,
        diffChangedFiles: input.diffChangedFiles,
        affectedAreas: packetData.affectedAreas,
    });

    // C014 (ADR-0086): changed files touching a `## Do not change` entry. Not draft-guarded — it
    // reconciles task-packet intent against the diff, independent of the spec's draft status. Empty in
    // the task-less case (Do-not-change is a task-only construct).
    const doNotChangeTouched = do_not_change_touched(input.diffChangedFiles, packetData.doNotChange);

    const packetStructural = reviewPacket !== null ? packet_structural_facts(reviewPacket) : EMPTY_PACKET_FACTS;
    const emptyEvidencePassRows = reviewPacket !== null ? empty_evidence_pass_rows(reviewPacket.coverageRows) : [];

    // The oversized-packet ADVISORY (ADR-0094/0097 — deliberately not a C-code): the size nudge off the committed diff stats. Computed only
    // when the command supplied stats (a fixture reconcile omits them → no size signal); the generated-
    // file exclusion + the band live in the contract (packet_size_facts).
    const packetSize = input.changedFileStats !== undefined ? packet_size_facts(input.changedFileStats) : null;

    // Spec-coverage drift (suspec-cli#1): the source spec's ids the task scope does not track. Keyed on
    // the SPEC-filtered scope (PG ids excluded, like coverage) so a migration's plan-guarantee ids never
    // count as untracked spec requirements. Neutral info — not folded into level_for.
    const driftFacts = spec_coverage_drift_facts({
        sourceSpecStatus: spec.frontmatter.status,
        specRequirementIds,
        inScopeIds: specKeyedScope,
    });
    const specCoverageDrift: SpecCoverageDriftReport | null =
        driftFacts !== null ? { ...driftFacts, message: spec_coverage_drift_message(driftFacts) } : null;

    // Fast-track staleness (ADR-0107): the CURRENT evidence digest over the diff + the coverage rows'
    // evidence. When the packet carries a stored `evidence_hash:` that no longer matches, the prior
    // review is Stale (the diff or the cited evidence moved) and re-routes to re-review. `reviewed_sha:`
    // is informational (when it was reviewed). Both are optional review-frontmatter keys.
    const evidenceDigest = evidence_digest(input.diffChangedFiles, reviewPacket?.coverageRows ?? []);
    const reviewFrontmatter = input.reviewPacketSource !== null ? read_frontmatter(input.reviewPacketSource) : null;
    // read_frontmatter yields a scalar OR a list for any key (YAML `- item` syntax). Normalize to the
    // first value so a hash/sha accidentally written as a one-item list is still read — not silently
    // dropped to undefined (which would skip Stale detection — a false negative).
    const storedHash = fm_scalar(reviewFrontmatter?.evidence_hash);
    const reviewedSha = fm_scalar(reviewFrontmatter?.reviewed_sha) ?? null;
    const digestDrifted = storedHash !== undefined && storedHash !== evidenceDigest;
    // #97: the digest hashes the diff's path SET + the coverage rows' evidence, NOT the diff CONTENT —
    // so a post-review content mutation of an already-reviewed file (same path set) leaves it unchanged
    // and the digest never rotates. A reviewed file that now differs from its `reviewed_sha` state is
    // content drift → also Stale. Precise (only the review's own diff paths count, never an unrelated
    // post-review commit) and 0-FP (paths_changed_since returns null → skip when the sha does not resolve).
    const changedSinceReview =
        reviewedSha !== null && input.pathsChangedSince !== undefined ? input.pathsChangedSince(reviewedSha) : null;
    const contentDrifted = changedSinceReview?.some((path) => input.diffChangedFiles.includes(path)) ?? false;
    const reviewStale = digestDrifted || contentDrifted ? { reviewedSha } : null;

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
        packetSize,
        specCoverageDrift,
        evidenceDigest,
        reviewStale,
        hasReviewPacket: reviewPacket !== null,
    };

    return ok({ level: level_for(withoutLevel), ...withoutLevel });
}
