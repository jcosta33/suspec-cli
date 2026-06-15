// CheckEngine, review-packet scope (M2, AC-028 / ADR-0079): run C012 (coverage) on a review file.
// `swarm check <review-file>` recognizes a `type: review` packet and reconciles its coverage table
// against the source spec — keyed on the task packet's declared `scope` — at C012's `warning`
// severity. Read-only; writes nothing. This is the `swarm check` face of the same C012 the review
// engine surfaces (one check, two commands; ADR-0079).
//
// Resolution: the review's frontmatter `task:` → tasks/<task>.md (scope + source spec id) → the
// specs/*/spec.md whose id matches (requirement ids + draft-guard status). When the task or spec is
// not resolvable, C012 cannot run; the engine returns a clean report with a diagnostic-free level
// (the spec/workspace checks already cover a missing artifact — this engine only adds C012).

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record, parse_task_packet } from '../../Sol/useCases/index.ts';
import { check_coverage, verdict_for, type Diagnostic } from '../services/checksContract.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { read_frontmatter } from '../services/readFrontmatter.ts';
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

function scalar(value: string | readonly string[] | undefined): string | undefined {
    if (value === undefined || typeof value === 'string') {
        return value;
    }
    return value[0];
}

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
        if (existsSync(specPath) && scalar(read_frontmatter(readFileSync(specPath, 'utf8')).id) === specId) {
            return readFileSync(specPath, 'utf8');
        }
    }
    return null;
}

export function check_review_file(input: CheckReviewFileInput): Result<CheckReviewFileReport, AppError> {
    const reviewSource = readFileSync(input.reviewPath, 'utf8');
    const reviewFrontmatter = read_frontmatter(reviewSource);
    const taskId = scalar(reviewFrontmatter.task);

    const clean = (diagnostics: Diagnostic[]): Result<CheckReviewFileReport, AppError> =>
        ok({ path: input.reviewPath, level: verdict_for(diagnostics), diagnostics });

    if (taskId === undefined) {
        return clean([]);
    }
    const taskSource = find_task_packet(input.workspaceDir, taskId);
    if (taskSource === null) {
        return clean([]);
    }
    const packet = parse_task_packet(taskSource);
    const specId = scalar(read_frontmatter(taskSource).source);
    const specSource = specId !== undefined ? find_source_spec(input.workspaceDir, specId) : null;
    if (specSource === null) {
        return clean([]);
    }
    const parsedSpec = parse_spec_record({ source: specSource, path: `${taskId}:spec` });
    /* v8 ignore next 3 -- find_source_spec already read this file's frontmatter to match the id, so its `---` fence is intact; parse_spec_record only errs on a missing/unclosed fence */
    if (!isOk(parsedSpec)) {
        return clean([]);
    }

    const review = parse_review_packet(reviewSource);
    const diagnostics = check_coverage({
        sourceSpecStatus: parsedSpec.value.frontmatter.status,
        inScopeIds: packet.scope,
        specRequirementIds: parsedSpec.value.requirements.map((requirement) => requirement.id),
        coverageRowIds: review.coverageRows.map((row) => row.id),
    });
    return clean(diagnostics);
}
