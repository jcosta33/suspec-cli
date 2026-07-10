// CheckEngine, review-packet scope (ADR-0079 C012; ADR-0083 C013; ADR-0097 C016; ADR-0128 C020):
// reconcile a review packet against the spec and task packet it is handed. `suspec check
// <review-path> --spec <spec-path> --task <task-path>` reads all three files and passes their
// sources here — the engine is PURE over the handed sources (ADR-0143: the CLI resolves nothing;
// companions are explicit flags, never discovered). Read-only; writes nothing; renders facts and a
// severity level, never a verdict (ADR-0077 D8).
//
// The reconcile: the task packet's declared `scope` keys the in-scope id set; the spec supplies the
// requirement ids, the named Verify command per id, and the draft-guard status. C020 fires when the
// review's frontmatter `task:` ref does not match the handed task packet's own id — a dangling or
// mistyped ref must not silently pass (the coverage/evidence checks would key on the wrong packet).

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import {
    check_coverage,
    check_verify_binding,
    check_pass_evidence,
    unresolvable_ref_diagnostic,
    verdict_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckReviewFileInput = Readonly<{
    reviewSource: string;
    reviewPath: string;
    // The companions, read by the command from the explicit --spec / --task paths (ADR-0143 D3 —
    // a review checked without them never reaches this engine; the command exits blocking first).
    specSource: string;
    specPath: string;
    taskSource: string;
}>;

export type CheckReviewFileReport = Readonly<{
    path: string;
    level: OutcomeLevel;
    diagnostics: readonly Diagnostic[];
}>;

export function check_review_file(input: CheckReviewFileInput): Result<CheckReviewFileReport, AppError> {
    const reviewFrontmatter = read_frontmatter(input.reviewSource);
    const taskRef = fm_scalar(reviewFrontmatter.task);

    const report = (diagnostics: Diagnostic[]): Result<CheckReviewFileReport, AppError> =>
        ok({ path: input.reviewPath, level: verdict_for(diagnostics), diagnostics });

    // C020 (ADR-0128): the review's `task:` ref must resolve to the handed task packet. A review
    // naming task X reconciled against a packet identifying as Y is keyed on the wrong slice —
    // emit C020 instead of a silently-miskeyed coverage table. Deliberately narrow: a review with
    // no `task:` ref reconciles against the handed packet as-is (the human named it explicitly).
    const packet = parse_task_packet(input.taskSource);
    const taskId = fm_scalar(read_frontmatter(input.taskSource).id);
    if (taskRef !== undefined && taskRef !== taskId) {
        return report([unresolvable_ref_diagnostic(taskRef, taskId ?? null)]);
    }

    // The spec view the checks key on: the requirement ids, the named Verify command per id, and
    // the source status (for the draft guard) — all from the handed spec.
    const parsed = parse_spec_record({ source: input.specSource, path: input.specPath });
    if (!isOk(parsed)) {
        return parsed;
    }
    const specRequirementIds = parsed.value.requirements.map((requirement) => requirement.id);
    const namedCommandById = new Map(
        parsed.value.requirements.map((requirement) => [requirement.id, requirement.verifyCommand])
    );
    const sourceSpecStatus = parsed.value.frontmatter.status;

    const review = parse_review_packet(input.reviewSource);
    // C012 (ADR-0079): the coverage reconcile — the task's declared scope against the review's
    // coverage rows and the spec's requirement ids.
    const coverage = check_coverage({
        sourceSpecStatus,
        inScopeIds: packet.scope,
        specRequirementIds,
        coverageRowIds: review.coverageRows.map((row) => row.id),
    });
    // C013 (ADR-0083): the verify-evidence-binding fact — the named command per id vs the review's
    // structured verify blocks against its Pass rows. The non-draft scope guard + verdict-free
    // shape live inside check_verify_binding; this engine only passes the extracted records.
    const verifyBinding = check_verify_binding({
        sourceSpecStatus,
        namedCommandById,
        coverageRows: review.coverageRows,
        verifyBlocks: review.verifyBlocks,
    });
    // C016 (ADR-0097): an empty-Evidence Pass row is a structural contradiction — the row claims
    // Pass with nothing backing it. NOT draft-guarded: it is independent of the spec's status.
    const passEvidence = check_pass_evidence(review.coverageRows);
    return report([...coverage, ...verifyBinding, ...passEvidence]);
}
