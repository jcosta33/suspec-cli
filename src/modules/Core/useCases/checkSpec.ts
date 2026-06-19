// CheckEngine, single-spec scope (AC-005): parse one spec into the common record, run the
// checks-contract core checks over it, and return a leveled report (clean / warning / blocking).
// No file is written (AC-008 — the diagnostics are the result, projected to stdout by the command).
//
// M1 parses the default plain two-tier form. `format: sol` routing to the stricter SOL parser is an
// M2 follow-up; the field is captured on the record so the command can surface that boundary.

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { run_spec_checks, verdict_for, type Diagnostic } from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CheckSpecInput = Readonly<{
    source: string;
    path: string;
    // Resolves a workspace ref to whether it exists (C009). Injected so the engine stays pure and
    // testable; the command supplies a filesystem-backed predicate.
    exists: (workspaceRef: string) => boolean;
    // Resolves a `[[KEY]]` citation to whether sources.md carries a matching `<a id="KEY">` anchor
    // (C015). Optional and injected like `exists`; the command builds it from the spec's named
    // sources.md, or omits it (defaulting to admit-every-key) when no sources.md is resolvable —
    // the ADR-0087 skip-when-nothing-to-check rule, so a spec is never false-flagged.
    anchor_resolves?: (key: string) => boolean;
}>;

export type SpecCheckReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    diagnostics: readonly Diagnostic[];
}>;

export function check_spec(input: CheckSpecInput): Result<SpecCheckReport, AppError> {
    const parsed = parse_spec_record({ source: input.source, path: input.path });
    if (isErr(parsed)) {
        return err(parsed.error);
    }
    const diagnostics = run_spec_checks({
        spec: parsed.value,
        exists: input.exists,
        anchor_resolves: input.anchor_resolves,
    });
    return ok({ level: verdict_for(diagnostics), path: input.path, diagnostics });
}
