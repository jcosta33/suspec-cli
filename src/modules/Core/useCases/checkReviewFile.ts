// CheckEngine, review-packet scope (M2, AC-028 / ADR-0079; C013 per ADR-0083): run C012 (coverage)
// and C013 (verify-evidence-binding) on a review file. `corpus check <review-file>` recognizes a
// `type: review` packet and reconciles its coverage table against the source spec — keyed on the task
// packet's declared `scope` — at both checks' `warning` severity. Read-only; writes nothing. This is
// the `corpus check` face of the same C012/C013 the review engine surfaces (one check, two commands;
// ADR-0079/0083 — AC-005 requires BOTH `corpus review` and `corpus check` to surface the C013 fact).
//
// Resolution: the review's frontmatter `task:` → tasks/<task>.md (scope + source spec id) → the
// specs/*/spec.md whose id matches (requirement ids + named verify commands + draft-guard status).
// When the task or spec is not resolvable, neither C012 nor C013 can run; the engine returns a clean
// report with a diagnostic-free level (the spec/workspace checks already cover a missing artifact —
// this engine only adds C012/C013).

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import {
    check_coverage,
    check_verify_binding,
    check_pass_evidence,
    verdict_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckReviewFileInput = Readonly<{
    workspaceDir: string;
    reviewPath: string;
}>;

export type CheckReviewFileReport = Readonly<{
    path: string;
    level: OutcomeLevel;
    diagnostics: readonly Diagnostic[];
}>;

// The task packet path for a review's `task:` id (tasks/<task>.md), or null when absent.
function find_task_packet(workspaceDir: string, taskId: string): string | null {
    const path = join(workspaceDir, 'tasks', `${taskId}.md`);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// The source spec for a `source:` spec id — the specs/*/spec.md whose frontmatter id matches.
function find_source_spec(workspaceDir: string, specId: string): string | null {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return null;
    }
    for (const slug of readdirSync(specsDir).sort()) {
        const specPath = join(specsDir, slug, 'spec.md');
        if (existsSync(specPath) && fm_scalar(read_frontmatter(readFileSync(specPath, 'utf8')).id) === specId) {
            return readFileSync(specPath, 'utf8');
        }
    }
    return null;
}

export function check_review_file(input: CheckReviewFileInput): Result<CheckReviewFileReport, AppError> {
    const reviewSource = readFileSync(input.reviewPath, 'utf8');
    const reviewFrontmatter = read_frontmatter(reviewSource);
    const taskId = fm_scalar(reviewFrontmatter.task);

    const clean = (diagnostics: Diagnostic[]): Result<CheckReviewFileReport, AppError> =>
        ok({ path: input.reviewPath, level: verdict_for(diagnostics), diagnostics });

    // Resolve the source spec + the in-scope ids. Two keyed paths (ADR-0103 review-to-spec):
    //  - TASK-keyed (the slice case): the review's `task:` → tasks/<id>.md → its `source:` spec; coverage
    //    keys on the TASK's scope (this review owns only its slice's ACs).
    //  - SPEC-keyed (the 1:1 case): no `task:`, the review names its spec directly via `spec:`; coverage
    //    keys on the SPEC's full AC set — the spec is the unit, the task an optional accessory.
    // The C012/C013/C016 checks then run identically against the resolved spec. `spec:` is an OPTIONAL
    // review-frontmatter key (not in checks.yaml's required list, so it breaks no existing review).
    // The resolved spec view the checks key on: the requirement ids, the named Verify command per id,
    // and the source status (for the draft guard). It comes from the LIVE spec when resolvable, or —
    // when the live spec is in a SEPARATE repo (cross-root) — from the task's EMBEDDED snapshot
    // (`## Spec snapshot`, ADR-0100 / corpus-cli#2), so a cross-root review is still validated.
    let specView: { requirementIds: readonly string[]; namedCommandById: Map<string, string | null>; status: string | null } | null = null;
    let taskScope: readonly string[] | null = null;

    const viewFromSpec = (source: string): typeof specView => {
        const parsed = parse_spec_record({ source, path: input.reviewPath });
        /* v8 ignore next 3 -- find_source_spec already matched this file's frontmatter, so its fence is intact; parse only errs on a missing/unclosed fence */
        if (!isOk(parsed)) {
            return null;
        }
        return {
            requirementIds: parsed.value.requirements.map((requirement) => requirement.id),
            namedCommandById: new Map(parsed.value.requirements.map((requirement) => [requirement.id, requirement.verifyCommand])),
            status: parsed.value.frontmatter.status,
        };
    };

    if (taskId !== undefined) {
        const taskSource = find_task_packet(input.workspaceDir, taskId);
        if (taskSource === null) {
            return clean([]);
        }
        const packet = parse_task_packet(taskSource);
        taskScope = packet.scope;
        const specId = fm_scalar(read_frontmatter(taskSource).source);
        const specSource = specId !== undefined ? find_source_spec(input.workspaceDir, specId) : null;
        if (specSource !== null) {
            specView = viewFromSpec(specSource);
        } else if (packet.embeddedRequirements.length > 0) {
            // Cross-root (ADR-0100): the live spec is unreachable; validate against the embedded slice.
            // The slice was cut from a non-draft spec, so treat it as non-draft (run the guarded checks).
            specView = {
                requirementIds: packet.embeddedRequirements.map((requirement) => requirement.id),
                namedCommandById: new Map(packet.embeddedRequirements.map((requirement) => [requirement.id, requirement.verifyCommand])),
                status: 'active',
            };
        }
    } else {
        // The task-less 1:1 review names its spec directly (`spec:`); with neither, nothing to reconcile.
        const specId = fm_scalar(reviewFrontmatter.spec);
        const specSource = specId !== undefined ? find_source_spec(input.workspaceDir, specId) : null;
        if (specSource !== null) {
            specView = viewFromSpec(specSource);
        }
    }
    if (specView === null) {
        return clean([]);
    }
    const specRequirementIds = specView.requirementIds;
    // The spec-keyed path keys coverage on the full spec; the task-keyed path narrows to the task scope.
    const inScopeIds = taskScope ?? specRequirementIds;

    const review = parse_review_packet(reviewSource);
    const coverage = check_coverage({
        sourceSpecStatus: specView.status,
        inScopeIds,
        specRequirementIds,
        coverageRowIds: review.coverageRows.map((row) => row.id),
    });
    // C013 (ADR-0083): the verify-evidence-binding fact — the named command per id vs the review's
    // structured verify blocks against its Pass rows. The non-draft scope guard + verdict-free shape
    // live inside check_verify_binding; this engine only passes the extracted records.
    const verifyBinding = check_verify_binding({
        sourceSpecStatus: specView.status,
        namedCommandById: specView.namedCommandById,
        coverageRows: review.coverageRows,
        verifyBlocks: review.verifyBlocks,
    });
    // C016 (ADR-0097): the GATE path blocks an empty-Evidence Pass row — the contract's hard-error
    // pass-needs-evidence rule, which the `corpus check` surface (unlike the advisory reconcile) is the
    // place to enforce. NOT draft-guarded: an empty-evidence Pass is a structural contradiction
    // independent of the source spec's status (the row claims Pass with nothing backing it).
    const passEvidence = check_pass_evidence(review.coverageRows);
    return clean([...coverage, ...verifyBinding, ...passEvidence]);
}
