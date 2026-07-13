// CheckEngine, file-set scope: the cross-file checks over the artifacts passed in ONE invocation.
// C002 (duplicate-id) is cross-file by nature — frontmatter `id:` uniqueness — so it keys on the
// passed set (ADR-0143: the CLI reads exactly the files it is handed; there is no tree to scan).
// PURE over identities already parsed and shape-checked once by the command.

import { ok, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { duplicate_id_diagnostic, level_for, type Diagnostic } from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckArtifactSetInput = Readonly<{
    artifacts: readonly Readonly<{ path: string; id: string | null }>[];
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
        if (artifact.id === null) {
            continue; // no identity claimed — nothing to collide
        }
        const first = firstPathById.get(artifact.id);
        if (first !== undefined) {
            diagnostics.push(duplicate_id_diagnostic(artifact.id, first, artifact.path));
            continue;
        }
        firstPathById.set(artifact.id, artifact.path);
    }
    return ok({ path: '(file set)', level: level_for(diagnostics), diagnostics });
}
