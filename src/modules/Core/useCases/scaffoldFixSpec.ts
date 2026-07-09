// Scaffold a store spec from a promoted source — a store finding or a GitHub issue
// (SPEC-suspec-v2 AC-017). `suspec fix` calls this, then hands the result to the `work` launch
// pipeline: the scaffold writes `spec-fix-<slug>.md` into the STORE (atomic, grammar-stamped) with
// `base_sha` = the repo's HEAD at scaffold time and `affected_areas` carried over from the finding
// when it declared any — so the staleness gate (AC-007) works on fix specs from day one. An
// existing namesake is REUSED, never clobbered (`created: false`) — re-running `fix` on the same
// source relaunches the same spec instead of forking it. The source body travels verbatim under
// `## Source`; the scaffold asserts nothing about the fix itself.

import { existsSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { spec_filename } from '../services/storeLayout.ts';
import { usage_error } from './unixOutcome.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

export type ScaffoldFixSpecInput = Readonly<{
    storeDir: string;
    slug: string; // the full spec slug, e.g. fix-find-042 / fix-issue-123 (spec-<slug>.md)
    title: string;
    sourceRef: string; // the promoted source — a finding id/filename or `#123`
    sourceBody: string; // the source's body, verbatim
    baseSha: string | null; // repo HEAD at scaffold time; null in a repo with no commits
    affectedAreas: readonly string[];
    labels?: readonly string[]; // gh issue labels, recorded as provenance when present
}>;

export type ScaffoldFixSpecReport = Readonly<{
    path: string;
    specId: string;
    slug: string;
    created: boolean; // false = an existing namesake was reused, byte-untouched
}>;

function render_fix_spec(input: ScaffoldFixSpecInput): string {
    const frontmatter = [
        '---',
        'type: spec',
        `id: SPEC-${input.slug}`,
        `title: Fix ${input.sourceRef} — ${input.title}`,
        'status: ready',
        `source: ${input.sourceRef}`,
        ...(input.baseSha !== null ? [`base_sha: ${input.baseSha}`] : []),
        ...(input.affectedAreas.length > 0
            ? ['affected_areas:', ...input.affectedAreas.map((area) => `  - ${area}`)]
            : []),
        ...(input.labels !== undefined && input.labels.length > 0 ? [`labels: ${input.labels.join(', ')}`] : []),
        '---',
    ];
    const body = [
        '',
        `# Fix — ${input.title}`,
        '',
        '## Intent',
        '',
        `Resolve ${input.sourceRef} ("${input.title}"). The source below is the authority on the`,
        'defect; this spec adds no claims of its own.',
        '',
        '## Source',
        '',
        input.sourceBody.length > 0 ? input.sourceBody : '(the source carried no body)',
        '',
        '## Requirements',
        '',
        '### AC-001 — the reported defect is resolved',
        '',
        'The behavior described in the source must no longer occur.',
        '',
        'Verify with: the reproduction from the source, exercised again and captured clean.',
        '',
        '## Non-goals',
        '',
        `- Anything beyond resolving ${input.sourceRef}.`,
        '',
    ];
    return [...frontmatter, ...body].join('\n');
}

export function scaffold_fix_spec(input: ScaffoldFixSpecInput): Result<ScaffoldFixSpecReport, AppError> {
    if (!is_safe_segment(input.slug)) {
        return err(usage_error(`cannot derive a fix-spec slug from "${input.slug}" — not a safe path segment`));
    }
    const path = join(input.storeDir, spec_filename(input.slug));
    const specId = `SPEC-${input.slug}`;
    if (existsSync(path)) {
        return ok({ path, specId, slug: input.slug, created: false });
    }
    const written = write_store_artifact(path, render_fix_spec(input));
    if (isErr(written)) {
        return err(written.error);
    }
    return ok({ path, specId, slug: input.slug, created: true });
}
