// PrepareEngine — `suspec stamp <ref>` (ADR-0107/0108): write the provenance stamp that makes
// staleness detection live. A SPEC gets `snapshot:` = the code repo's current HEAD (the state its
// text was written against — `check --staleness` compares against it). An in-place frontmatter
// upsert; the rest of the file is byte-preserved, and only that key is touched. Review stamping is
// gone with the workspace review packets (ADR-0137) — store runs reconcile via `suspec review`.

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, isAbsolute } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { head_sha } from '../../Workspace/useCases/index.ts';
import { upsert_frontmatter } from '../services/readFrontmatter.ts';
import { find_source_spec } from './taskLocator.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type StampReport = Readonly<{
    level: OutcomeLevel; // always 'clean' — stamping is a successful write, mapped to exit 0
    kind: 'spec';
    path: string; // workspace-relative path of the stamped file
    stamped: Readonly<Record<string, string>>; // the keys + values written
}>;

export type StampArtifactInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    ref: string; // a spec id/slug or a review filename/slug
}>;

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
    // Defense-in-depth: a ref is an id / dir-slug / review filename — never a path. Reject traversal,
    // separators, or an absolute ref so the writes below can never land outside specs/ or reviews/.
    if (input.ref.includes('..') || input.ref.includes('/') || input.ref.includes('\\') || isAbsolute(input.ref)) {
        return err(usage_error(`invalid ref "${input.ref}": expected a spec id/slug or a review filename, not a path`));
    }
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

    // A ref that resolves to no spec: reviews are store artifacts now — point at the store loop
    // instead of guessing at a reviews/ tree that no longer exists (ADR-0137).
    return err(
        usage_error(
            `cannot stamp ${input.ref}: no spec (specs/${input.ref}/spec.md or matching id). Review packets live in the store — reconcile a run with \`suspec review <RUN>\`.`
        )
    );
}
