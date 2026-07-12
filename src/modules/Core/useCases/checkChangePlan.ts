// CheckEngine, change-plan scope (W6 / SPEC-change-plan-checks): parse one change plan into the
// change-plan record, run the change-plan core checks (C010 preserves-refs-resolve, C011
// waves-present) over it, and return a leveled report (clean / warning / blocking) — the structural
// sibling of check_spec. No file is written (the diagnostics are the result, projected by the
// command); read-only, like every check path (ADR-0077 D8: findings + a level, no review result).
//
// C010 resolves a `SPEC-x#AC-NNN` ref against the named spec. Resolution is injected as
// `spec_ref_resolves` so the engine stays pure and testable; the command supplies a
// filesystem-backed predicate (a spec-id → requirement-id map built from the plan's sibling specs).

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_change_plan } from '../../Sol/useCases/index.ts';
import {
    check_preserves_refs_resolve,
    check_waves_present,
    level_for,
    type Diagnostic,
} from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckChangePlanInput = Readonly<{
    source: string;
    path: string;
    // Resolves a `SPEC-x#AC-NNN` ref to whether the named spec exists and defines the anchor (C010).
    // Injected so the engine stays pure; the command supplies a filesystem-backed predicate.
    spec_ref_resolves: (specId: string, acId: string) => boolean;
}>;

export type ChangePlanCheckReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    diagnostics: readonly Diagnostic[];
}>;

export function check_change_plan(input: CheckChangePlanInput): Result<ChangePlanCheckReport, AppError> {
    const parsed = parse_change_plan({ source: input.source, path: input.path });
    if (isErr(parsed)) {
        return err(parsed.error);
    }
    const plan = parsed.value;
    const diagnostics = [
        ...check_preserves_refs_resolve({
            refs: plan.preservedRefs,
            guaranteeIds: plan.guaranteeIds,
            spec_ref_resolves: input.spec_ref_resolves,
        }),
        ...check_waves_present({
            kind: plan.kind,
            waves: plan.waves.map((wave) => ({ namesCheck: wave.namesCheck, line: wave.line })),
        }),
    ];
    return ok({ level: level_for(diagnostics), path: input.path, diagnostics });
}
