// PrepareEngine — the destructive half of `suspec clean --apply` (SPEC-suspec-clean; ADR-0106 item 2,
// ADR-0104 ephemeral-by-default, ADR-0096 archive-transitory). Given the spent candidates the scan
// surfaced (scanCleanCandidates), it prunes each: a GITIGNORED/untracked file is DELETED (it is the
// working set, recoverable from the run); a COMMITTED file is MOVED under archive/, preserving its
// tasks//reviews/ subpath (ADR-0096 — never hard-delete committed history from the tree). Touches ONLY
// the candidate paths the scan already restricted to spent tasks//reviews — never the durable set.

import { existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname, relative, isAbsolute } from 'path';

import { ok, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { path_is_tracked } from '../../Workspace/useCases/index.ts';
import type { CleanCandidate } from './scanCleanCandidates.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CleanResult = Readonly<{
    level: OutcomeLevel;
    deleted: readonly string[]; // gitignored/untracked candidates removed
    archived: readonly string[]; // committed candidates moved under archive/
}>;

export type ApplyCleanInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    candidates: readonly CleanCandidate[];
}>;

export function apply_clean(input: ApplyCleanInput): Result<CleanResult, AppError> {
    const deleted: string[] = [];
    const archived: string[] = [];
    for (const candidate of input.candidates) {
        const abs = join(input.workspaceDir, candidate.path);
        // Defense-in-depth: never act on a path that escapes the workspace. scan_clean_candidates only
        // yields immediate tasks//reviews/ filenames, but apply_clean is exported + destructive — a
        // candidate whose path normalizes outside the workspace (a `..` traversal) is refused outright.
        const within = relative(input.workspaceDir, abs);
        if (within.startsWith('..') || isAbsolute(within)) {
            continue;
        }
        if (!existsSync(abs)) {
            continue; // already gone (a concurrent prune); nothing to do
        }
        // Tracked vs gitignored decides archive vs delete (ADR-0096 / ADR-0104). The tracked check keys
        // on the path RELATIVE to the git repo, which may differ from the workspace root.
        if (path_is_tracked(input.repoRoot, relative(input.repoRoot, abs))) {
            // Archive: move under archive/, preserving the candidate's tasks//reviews/ subpath so two
            // same-named files in different dirs never collide.
            const dest = join(input.workspaceDir, 'archive', candidate.path);
            mkdirSync(dirname(dest), { recursive: true });
            renameSync(abs, dest);
            archived.push(candidate.path);
        } else {
            unlinkSync(abs);
            deleted.push(candidate.path);
        }
    }
    return ok({ level: 'clean', deleted, archived });
}
