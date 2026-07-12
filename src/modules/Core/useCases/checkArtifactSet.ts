// CheckEngine, file-set scope: the cross-file checks over the artifacts passed in ONE invocation.
// C002 (duplicate-id) is cross-file by nature — frontmatter `id:` uniqueness — so it keys on the
// passed set (ADR-0143: the CLI reads exactly the files it is handed; there is no tree to scan).
// PURE over the handed sources; the command reads the files and passes them here.

import { ok, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { duplicate_id_diagnostic, level_for, type Diagnostic } from '../services/checksContract.ts';
import { read_frontmatter, fm_scalar } from '../services/readFrontmatter.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckArtifactSetInput = Readonly<{
    artifacts: readonly Readonly<{ path: string; source: string }>[];
}>;

export type ArtifactSetReport = Readonly<{
    path: string;
    level: OutcomeLevel;
    diagnostics: readonly Diagnostic[];
}>;

export function check_artifact_set(input: CheckArtifactSetInput): Result<ArtifactSetReport, AppError> {
    const diagnostics: Diagnostic[] = [];
    const firstPathById = new Map<string, string>();
    for (const artifact of input.artifacts) {
        const id = fm_scalar(read_frontmatter(artifact.source).id);
        if (id === undefined) {
            continue; // no identity claimed — nothing to collide
        }
        const first = firstPathById.get(id);
        if (first !== undefined) {
            diagnostics.push(duplicate_id_diagnostic(id, first, artifact.path));
            continue;
        }
        firstPathById.set(id, artifact.path);
    }
    return ok({ path: '(file set)', level: level_for(diagnostics), diagnostics });
}
