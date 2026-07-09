// Scaffold a STORE spec from a one-line intent (SPEC-suspec-v2 AC-023) — `suspec write spec`'s
// engine, scaffold_fix_spec's intent-first sibling. Writes `spec-<slug>.md` into the store
// (atomic, grammar-stamped by write_store_artifact) with `status: draft`, `base_sha` = the repo's
// HEAD at scaffold time, the intent line in the body, and a Requirements skeleton of ONE empty AC
// with a `Verify with:` placeholder — the CLI authors NO requirement content (the spec-author
// prompt does that, dispatched by the command under --launch). The skeleton lints clean under the
// checks engine at `status: draft` (C003/C004/C005/C006/C008 satisfied; C007 exempts a draft).
// An existing namesake is REUSED, never clobbered (`created: false`), mirroring scaffold_fix_spec.

import { existsSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { spec_filename } from '../services/storeLayout.ts';
import { usage_error } from './unixOutcome.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

export type ScaffoldStoreSpecInput = Readonly<{
    storeDir: string;
    slug: string; // derived from the intent by the command, validated here as a safe segment
    intent: string; // the one-line intent — the title and the Intent body line
    baseSha: string | null; // repo HEAD at scaffold time; null in a repo with no commits
}>;

export type ScaffoldStoreSpecReport = Readonly<{
    path: string;
    specId: string;
    slug: string;
    created: boolean; // false = an existing namesake was reused, byte-untouched
}>;

function render_store_spec(input: ScaffoldStoreSpecInput): string {
    const frontmatter = [
        '---',
        'type: spec',
        `id: SPEC-${input.slug}`,
        `title: ${input.intent}`,
        'status: draft',
        ...(input.baseSha !== null ? [`base_sha: ${input.baseSha}`] : []),
        'sources:',
        '  - self',
        '---',
    ];
    const body = [
        '',
        `# ${input.intent}`,
        '',
        '## Intent',
        '',
        input.intent,
        '',
        '## Requirements',
        '',
        '### AC-001 — {{short name}}',
        '',
        'When {{condition}}, {{the component}} must {{observable behavior}}.',
        '',
        'Verify with: {{command or check}}',
        '',
        '## Non-goals',
        '',
        '- {{what this spec deliberately does not change}}',
        '',
        '## Open questions',
        '',
        '- none',
        '',
    ];
    return [...frontmatter, ...body].join('\n');
}

export function scaffold_store_spec(input: ScaffoldStoreSpecInput): Result<ScaffoldStoreSpecReport, AppError> {
    if (!is_safe_segment(input.slug)) {
        return err(usage_error(`cannot derive a spec slug from "${input.slug}" — not a safe path segment`));
    }
    const path = join(input.storeDir, spec_filename(input.slug));
    const specId = `SPEC-${input.slug}`;
    if (existsSync(path)) {
        return ok({ path, specId, slug: input.slug, created: false });
    }
    const written = write_store_artifact(path, render_store_spec(input));
    if (isErr(written)) {
        return err(written.error);
    }
    return ok({ path, specId, slug: input.slug, created: true });
}
