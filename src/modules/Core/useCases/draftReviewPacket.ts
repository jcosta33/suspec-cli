// PrepareEngine — `swarm review <task> --write` (W4b, AC-001/002/003/006). Render a DRAFT review
// packet from the kit `review.md` template, populated from the SAME read-only reconcile the M2
// command surfaces (reconcile_review) — it adds NO new reconcile logic. Writing a draft is a
// prepare/scaffold operation (like `swarm new`), not adjudication: the human owns every Result
// (ADR-0077 Decision 8). Pure: source records in, the rendered markdown out — the caller (the
// command / the Workspace write helper) owns the single no-clobber file write (AC-004).
//
// The load-bearing guards (the whole reason M2 deferred the writer — the rubber-stamp hazard):
//   - NEVER a Pass. Every coverage row's Result is `Unverified`. A row whose reconcile found a
//     CONSISTENT C013 verify block (cmd matches the requirement's named command + result=pass) gets
//     that block's recorded cmd+result as EVIDENCE in the cell — but the Result stays `Unverified`
//     (a Pass is a human judgment after the spot-check). The writer never emits Pass/Fail/Blocked.
//   - ALWAYS `status: draft`. Never a terminal status (pass/waived/blocked/needs-human).
//   - NO verdict / NO merge decision. The Suggested-decision section is a placeholder for the human.

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { normalize_cmd } from '../services/checksContract.ts';
import { read_frontmatter } from '../services/readFrontmatter.ts';
import { reconcile_review, type ReconcileReviewInput, type ReviewReport } from './reconcileReview.ts';

// The only Result a coverage row may carry — the Unverified floor (AC-002). Named so the no-Pass
// guard reads as a single source of truth a reviewer can grep.
const UNVERIFIED = 'Unverified' as const;
// The only frontmatter status the writer ever emits — never a terminal status (AC-003).
const DRAFT_STATUS = 'draft' as const;

export type DraftReviewPacketInput = ReconcileReviewInput & {
    // The enclosing review slug (the `reviews/<slug>.md` stem); carried into the frontmatter ids.
    readonly slug: string;
};

// The rendered draft (the markdown) + the facts a caller surfaces. Carries NO Result / status:pass /
// merge field — the verdict-free boundary (AC-006); `status` here is the literal `draft` only.
export type DraftReviewPacket = Readonly<{
    slug: string;
    markdown: string;
}>;


// One Evidence cell per in-scope id, lifted from what the reconcile read — never invented (the
// no-fabrication non-goal). The only evidence a draft pre-fills is a CONSISTENT C013 verify block
// (its recorded `cmd` matches the requirement's named command and reads result=pass): rendered as
// the block's cmd + result, a pointer to the paste the reviewer spot-checks. An empty cell otherwise
// (no packet yet, or no consistent block) — which reads Unverified. NOT a Pass, NOT the verdict.
function evidence_by_id(input: DraftReviewPacketInput): Map<string, string> {
    const evidence = new Map<string, string>();
    if (input.reviewPacketSource === null) {
        return evidence;
    }
    const parsedSpec = parse_spec_record({ source: input.specSource, path: `${input.task}:spec` });
    if (isErr(parsedSpec)) {
        return evidence;
    }
    // A draft source spec's named commands are work-in-progress — the same scope guard C013 applies;
    // no consistent-block evidence is lifted from a draft-spec reconcile.
    if (parsedSpec.value.frontmatter.status === 'draft') {
        return evidence;
    }
    const namedCommandById = new Map<string, string | null>(
        parsedSpec.value.requirements.map((requirement) => [requirement.id, requirement.verifyCommand])
    );
    const packet = parse_review_packet(input.reviewPacketSource);
    // Index the verify blocks by id; a row's first keyed block backs it (mirrors verify_binding_facts).
    const blockById = new Map<string, { cmd: string | null; result: 'pass' | 'fail' | null; malformed: boolean }>();
    for (const block of packet.verifyBlocks) {
        if (block.id !== null && !blockById.has(block.id)) {
            blockById.set(block.id, block);
        }
    }
    for (const row of packet.coverageRows) {
        const block = blockById.get(row.id);
        const named = namedCommandById.get(row.id) ?? null;
        if (
            block !== undefined &&
            !block.malformed &&
            block.result === 'pass' &&
            block.cmd !== null &&
            named !== null &&
            normalize_cmd(block.cmd) === normalize_cmd(named)
        ) {
            // The consistent block's recorded command + its pass signal — the evidence the reviewer
            // re-runs. Backticked so the cell renders the command verbatim; still Unverified.
            evidence.set(row.id, `\`${block.cmd}\` recorded result=pass`);
        }
    }
    return evidence;
}

// The Human-attention lines — the routed exceptions, NOT the diff (the template's rule). Built from
// the SAME reconcile facts the M2 stdout renderer routes (format_review_report), so the draft's
// attention list and the read-only reconcile agree. Each line is "<trigger> — why it matters".
function human_attention(report: ReviewReport): string[] {
    const lines: string[] = [];
    if (!report.hasReviewPacket) {
        lines.push('No review packet yet — every in-scope requirement reads uncovered until a human fills it.');
    }
    for (const finding of report.coverage) {
        lines.push(`C012 ${finding.kind}: ${finding.message}`);
    }
    for (const finding of report.verifyBinding) {
        lines.push(`C013 ${finding.kind}: ${finding.message}`);
    }
    for (const id of report.scopeDivergence) {
        lines.push(`scope≠spec: scope id ${id} is not defined in the source spec.`);
    }
    for (const path of report.selfReport.claimedNotInDiff) {
        lines.push(`claimed-not-changed: the Run summary claims ${path} but the diff does not show it.`);
    }
    for (const path of report.selfReport.inDiffNotClaimed) {
        lines.push(`changed-not-claimed: ${path} changed but the Run summary never mentions it.`);
    }
    if (report.selfReport.runSummaryUnparsed) {
        lines.push(
            'run-summary-unparsed: the Run summary lists no machine-checkable file paths — selfReport reconcile skipped (list changed files as backticked paths to enable it).'
        );
    }
    for (const path of report.selfReport.outsideScope) {
        lines.push(`outside-scope: ${path} changed but is outside the declared Affected areas.`);
    }
    for (const path of report.doNotChangeTouched) {
        lines.push(`do-not-change: ${path} changed but the task lists it under Do not change.`);
    }
    for (const id of report.emptyEvidencePassRows) {
        lines.push(`empty-evidence: coverage row ${id} is Pass with empty Evidence — reads Unverified.`);
    }
    for (const id of report.packetStructural.badResultCells) {
        lines.push(`bad-result: coverage row ${id} has a Result outside {Pass, Fail, Unverified, Blocked}.`);
    }
    if (report.packetStructural.badStatus !== null) {
        lines.push(`bad-status: frontmatter status "${report.packetStructural.badStatus}" is not a recognized review status.`);
    }
    if (report.packetStructural.statusPassContradicted) {
        lines.push('status-contradicted: status: pass but a coverage row is not Pass.');
    }
    for (const section of report.packetStructural.missingSections) {
        lines.push(`missing-section: the review packet has no "${section}" section.`);
    }
    return lines;
}

// Escape a pipe in a cell value so a command containing `|` cannot break the GFM table (the row's
// column count must stay four for C012/the structural check to read it).
function cell(value: string): string {
    return value.replace(/\|/g, '\\|');
}

function render_draft(args: {
    slug: string;
    title: string;
    inScopeIds: readonly string[];
    changedFiles: readonly string[];
    evidence: ReadonlyMap<string, string>;
    attention: readonly string[];
}): string {
    const changedList =
        args.changedFiles.length > 0
            ? args.changedFiles.map((path) => `- \`${path}\``).join('\n')
            : '- _(no changed files in the diff)_';
    // One coverage row per in-scope id, EVERY Result Unverified (AC-002). The Evidence cell carries a
    // consistent C013 block's recorded cmd+result where the reconcile found one, else empty.
    const coverageRows =
        args.inScopeIds.length > 0
            ? args.inScopeIds
                  .map((id) => `| ${id} | ${UNVERIFIED} | ${cell(args.evidence.get(id) ?? '')} | yes |`)
                  .join('\n')
            : '| _(no in-scope ids on the task packet)_ | | | |';
    const attentionList =
        args.attention.length > 0
            ? args.attention.map((line, index) => `${index + 1}. ${line}`).join('\n')
            : '_(no reconcile exceptions to route — a human still owns every Result.)_';

    return `---
type: review
id: REVIEW-${args.slug}
task: TASK-${args.slug}
pr: none yet
reviewer: {{who reviews — never the implementing session}}
status: ${DRAFT_STATUS}
---

# Review: ${args.title}

## Summary

{{2–3 sentences: what changed, what is verified, what is not. This is a draft scaffold from the reconcile — a human fills the judgment.}}

## Changed files

${changedList}

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
${coverageRows}

<!-- Every row is Unverified: a draft scaffold never pre-fills a Pass (a Pass is a human judgment
     after the spot-check). An evidence cell carrying a consistent verify block's cmd+result is a
     pointer to re-run, not a verdict. -->

Spot-checked: {{which green row's evidence you re-ran yourself}}

## Human attention

${attentionList}

## Suggested decision

{{Merge / Merge with waiver (who · why · expiry) / Block until … — a human decides; the writer computes no decision.}}
`;
}

export function draft_review_packet(input: DraftReviewPacketInput): Result<DraftReviewPacket, AppError> {
    const reconciled = reconcile_review(input);
    if (isErr(reconciled)) {
        return reconciled;
    }
    const report = reconciled.value;

    const packet = parse_task_packet(input.taskPacketSource);
    if (packet.scope.length === 0) {
        return err(
            createAppError(
                'EmptyScope',
                `cannot draft a review for ${input.task}: its task packet declares no scope (no in-scope requirement ids)`,
                { task: input.task }
            )
        );
    }

    const frontmatter = read_frontmatter(input.specSource);
    const rawTitle = frontmatter.title;
    const title = typeof rawTitle === 'string' && rawTitle.length > 0 ? rawTitle : input.task;

    const markdown = render_draft({
        slug: input.slug,
        title,
        inScopeIds: packet.scope,
        changedFiles: report.diffChangedFiles,
        evidence: evidence_by_id(input),
        attention: human_attention(report),
    });

    return ok({ slug: input.slug, markdown });
}
