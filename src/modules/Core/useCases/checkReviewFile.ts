// CheckEngine, review-packet scope (ADR-0079 C012; ADR-0083 C013; ADR-0097 C016; ADR-0128 C020):
// reconcile a review packet against the spec — and, when the review names a task, the task packet —
// it is handed. `suspec check <review-path> --spec <spec-path> [--task <task-path>]` reads the
// files and passes their sources here — the engine is PURE over the handed sources (ADR-0143: the
// CLI resolves nothing; companions are explicit flags, never discovered). Read-only; writes
// nothing; renders facts and a severity level, never a verdict (ADR-0077 D8).
//
// Two keyed paths (a task participates when the review names one — ADR-0134):
//  - TASK-keyed: the review's `task:` names a task; its handed packet's declared `scope` keys the
//    in-scope id set. C020 fires when the ref does not match the handed packet's own id — a
//    dangling or mistyped ref must not silently pass (coverage/evidence would key on the wrong
//    slice). A review that names a task but is handed no packet is a usage error (exit 2 naming
//    the flag) — the floor never silently degrades into a spec-only check.
//  - SPEC-keyed: a task-less 1:1 review reconciles against the spec's full requirement id set;
//    C020 is not applicable (no ref to resolve). A handed packet the review never references is a
//    wiring mistake, refused as a usage error.

import { ok, err, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import {
    check_coverage,
    check_verify_binding,
    check_supported_evidence,
    unresolvable_ref_diagnostic,
    level_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type CheckReviewFileInput = Readonly<{
    reviewSource: string;
    reviewPath: string;
    // The always-required companion, read by the command from the explicit --spec path (ADR-0143
    // D3 — a review checked without it never reaches this engine; the command exits blocking).
    specSource: string;
    specPath: string;
    // The conditional companion (--task): required iff the review's frontmatter names a `task:`.
    // undefined = no --task was given.
    taskSource?: string;
}>;

export type CheckReviewFileReport = Readonly<{
    path: string;
    level: OutcomeLevel;
    diagnostics: readonly Diagnostic[];
}>;

function fm_items(value: string | readonly string[] | undefined): readonly string[] {
    let entries: readonly string[] = [];
    if (typeof value === 'string') {
        entries = [value];
    } else if (value !== undefined) {
        entries = value;
    }
    return entries
        .flatMap((entry) => entry.trim().replace(/^\[/, '').replace(/\]$/, '').split(','))
        .map(normalize_scalar)
        .filter((item) => item.length > 0);
}

export function check_review_file(input: CheckReviewFileInput): Result<CheckReviewFileReport, AppError> {
    const reviewFrontmatter = read_frontmatter(input.reviewSource);
    if (Array.isArray(reviewFrontmatter.task)) {
        return err(usage_error('review `task:` must be a single scalar, not a list'));
    }
    const taskRef = fm_scalar(reviewFrontmatter.task);

    // The conditional-companion rule (ADR-0143 D3 × ADR-0134): a review that names a task must be
    // handed that task — checked without it, C012's scope keying and C020 simply would not run, so
    // the missing flag is a blocking usage error, never a silent downgrade to spec-only checking.
    if (taskRef !== undefined && input.taskSource === undefined) {
        return err(
            usage_error(
                `the review names task \`${taskRef}\`: missing --task — usage: suspec check <review-path> --spec <spec-path> --task <task-path>`
            )
        );
    }
    // The inverse wiring mistake: a handed packet the review never references keys on nothing.
    if (taskRef === undefined && input.taskSource !== undefined) {
        return err(
            usage_error(
                '--task names a packet but the review references no task (no `task:` frontmatter) — a companion nothing references is a wiring mistake'
            )
        );
    }

    const specFrontmatter = read_frontmatter(input.specSource);
    if (Array.isArray(specFrontmatter.type)) {
        return err(usage_error('--spec `type:` must be a single scalar, not a list'));
    }
    if (Array.isArray(specFrontmatter.id)) {
        return err(usage_error('--spec `id:` must be a single scalar, not a list'));
    }
    const specType = fm_scalar(specFrontmatter.type);
    if (specType !== undefined && specType !== 'spec') {
        return err(usage_error(`--spec companion must have \`type: spec\` or omit \`type:\`; received ${specType}`));
    }

    const report = (diagnostics: Diagnostic[]): Result<CheckReviewFileReport, AppError> =>
        ok({ path: input.reviewPath, level: level_for(diagnostics), diagnostics });

    // C020 (ADR-0128): the review's `task:` ref must resolve to the handed task packet. A review
    // naming task X reconciled against a packet identifying as Y is keyed on the wrong slice —
    // emit C020 instead of a silently-miskeyed coverage table.
    let taskScope: readonly string[] | null = null;
    if (input.taskSource !== undefined) {
        const taskFrontmatter = read_frontmatter(input.taskSource);
        if (Array.isArray(taskFrontmatter.type)) {
            return err(usage_error('--task `type:` must be a single scalar, not a list'));
        }
        if (Array.isArray(taskFrontmatter.id)) {
            return err(usage_error('--task `id:` must be a single scalar, not a list'));
        }
        const taskType = fm_scalar(taskFrontmatter.type);
        if (taskType !== 'task') {
            return err(usage_error(`--task companion must have \`type: task\`; received ${taskType ?? 'no type'}`));
        }
        const packet = parse_task_packet(input.taskSource);
        const taskId = fm_scalar(taskFrontmatter.id);
        if (taskRef !== taskId) {
            return report([unresolvable_ref_diagnostic(taskRef ?? '', taskId ?? null)]);
        }
        if (packet.scope.length === 0) {
            return err(usage_error('--task companion must name at least one requirement in `scope:`'));
        }
        const specId = fm_scalar(specFrontmatter.id);
        if (specId === undefined) {
            return err(usage_error('--spec companion must name its artifact in `id:`'));
        }
        if (!fm_items(taskFrontmatter.source).includes(specId)) {
            return err(usage_error(`--task companion does not name handed spec \`${specId}\` in \`source:\``));
        }
        taskScope = packet.scope;
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
    // C012 (ADR-0079): the coverage reconcile. The task-keyed path narrows the in-scope id set to
    // the task's declared scope; the spec-keyed (task-less 1:1) path keys on the spec's full set.
    const coverage = check_coverage({
        sourceSpecStatus,
        inScopeIds: taskScope ?? specRequirementIds,
        specRequirementIds,
        coverageRowIds: review.coverageRows.map((row) => row.id),
    });
    // C013 (ADR-0083): the verify-evidence-binding fact — the named command per id vs the review's
    // structured verify blocks against its Supported rows.
    // shape live inside check_verify_binding; this engine only passes the extracted records.
    const verifyBinding = check_verify_binding({
        sourceSpecStatus,
        namedCommandById,
        coverageRows: review.coverageRows,
        verifyBlocks: review.verifyBlocks,
    });
    const supportedEvidence = check_supported_evidence(review.coverageRows);
    return report([...coverage, ...verifyBinding, ...supportedEvidence]);
}
