// PrepareEngine — `corpus stamp <ref>` (ADR-0107/0108): write the provenance stamp that makes
// staleness detection live. A SPEC gets `snapshot:` = the code repo's current HEAD (the state its text
// was written against — snapshot-staleness compares against it). A REVIEW gets `reviewed_sha:` = HEAD +
// `evidence_hash:` = the reconcile's evidence digest (fast-track re-validates against it). Both are an
// in-place frontmatter upsert; the rest of the file is byte-preserved, and only those keys are touched
// (never the board — the no-board-write invariant, ADR-0084 D3, holds).

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { head_sha } from '../../Workspace/useCases/index.ts';
import { read_frontmatter, upsert_frontmatter } from '../services/readFrontmatter.ts';
import { find_source_spec } from './taskLocator.ts';
import { resolve_review_run } from './resolveReviewRun.ts';
import { resolve_review_run_by_spec } from './resolveReviewRunBySpec.ts';
import { reconcile_review } from './reconcileReview.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type StampReport = Readonly<{
    level: OutcomeLevel; // always 'clean' — stamping is a successful write, mapped to exit 0
    kind: 'spec' | 'review';
    path: string; // workspace-relative path of the stamped file
    stamped: Readonly<Record<string, string>>; // the keys + values written
}>;

export type StampArtifactInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    ref: string; // a spec id/slug or a review filename/slug
}>;

function scalar(value: string | readonly string[] | undefined): string | undefined {
    if (value === undefined || typeof value === 'string') {
        return value;
    }
    return value[0];
}

// Resolve a spec file for the ref: a dir slug (specs/<ref>/spec.md) or a frontmatter id.
function find_spec_path(workspaceDir: string, ref: string): string | null {
    const bySlug = join(workspaceDir, 'specs', ref, 'spec.md');
    if (existsSync(bySlug)) {
        return bySlug;
    }
    const byId = find_source_spec(workspaceDir, ref);
    return byId !== null ? byId.path : null;
}

export function stamp_artifact(input: StampArtifactInput): Result<StampReport, AppError> {
    const sha = head_sha(input.repoRoot);
    if (sha === null) {
        return err(usage_error('cannot stamp: no resolvable git HEAD (not a repo, or no commits yet)'));
    }

    // SPEC mode: stamp the snapshot SHA (the code state this spec's text was written against).
    const specPath = find_spec_path(input.workspaceDir, input.ref);
    if (specPath !== null) {
        const stamped = { snapshot: sha };
        writeFileSync(specPath, upsert_frontmatter(readFileSync(specPath, 'utf8'), stamped));
        return ok({ level: 'clean', kind: 'spec', path: specPath, stamped });
    }

    // REVIEW mode: reconcile (to compute the evidence digest), then stamp reviewed_sha + evidence_hash.
    const reviewPath = join(input.workspaceDir, 'reviews', input.ref.endsWith('.md') ? input.ref : `${input.ref}.md`);
    if (!existsSync(reviewPath)) {
        return err(usage_error(`cannot stamp ${input.ref}: no spec (specs/${input.ref}/spec.md or matching id) and no reviews/${input.ref}.md`));
    }
    const reviewSource = readFileSync(reviewPath, 'utf8');
    const frontmatter = read_frontmatter(reviewSource);
    const taskId = scalar(frontmatter.task);
    const specId = scalar(frontmatter.spec);
    if (taskId === undefined && specId === undefined) {
        return err(usage_error(`cannot stamp ${input.ref}: the review names neither a task: nor a spec:`));
    }
    const resolved =
        taskId !== undefined
            ? resolve_review_run({ workspaceDir: input.workspaceDir, repoRoot: input.repoRoot, task: taskId })
            : resolve_review_run_by_spec({ workspaceDir: input.workspaceDir, repoRoot: input.repoRoot, spec: specId as string });
    if (isErr(resolved)) {
        return err(resolved.error);
    }
    const report = reconcile_review(resolved.value);
    /* v8 ignore next 3 -- defensive: resolve already read the spec to find it, so its fence is intact; reconcile_review only errs on an unparseable spec */
    if (isErr(report)) {
        return err(report.error);
    }
    const stamped = { reviewed_sha: sha, evidence_hash: report.value.evidenceDigest };
    writeFileSync(reviewPath, upsert_frontmatter(reviewSource, stamped));
    return ok({ level: 'clean', kind: 'review', path: reviewPath, stamped });
}
