// The kit update-apply engine (`swarm update --write`, SPEC-swarm-update AC-008, ADR-0091). Behind the
// drift check, this refreshes the KIT-OWNED guidance in an existing workspace WITHOUT touching the
// adopter's own artifacts. It is built by reuse, not a fresh merge engine:
//   1. `check_update` re-reads the pin vs the kit VERSION — apply is a no-op when not behind (so a
//      `--write` on an up-to-date workspace is honest, never a churn of identical files).
//   2. when behind, `init_workspace` (mode: workspace) replays the conflict-safe copy engine, but
//      SCOPED by `pathFilter` to the kit-owned paths only — templates/, .agents/skills/, advanced/,
//      hooks/. New kit files are written, a changed kit-owned file follows the policy (default
//      `backup`: the user's edited copy → `*.swarm-bak`, the kit's lands), identical files no-op,
//      `.gitignore` marker-merges (additive), and `stamp_version` re-stamps the pin.
// The scope is the whole point of the design (ADOPTING.md's upgrade contract): a lived-in workspace's
// board, specs, decisions, README, and customized bootloader are the adopter's — `--write` must not
// back them up or warn on them. Only the kit's guidance is refreshed.
// No new write paths, so the apply inherits the copy engine's symlink/backup/idempotency guarantees
// and its Result-channel error handling. Still no network here (the surface resolves the kit).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ok, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { check_update } from './checkUpdate.ts';
import { init_workspace, type ConflictPolicy } from './initWorkspace.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type ApplyUpdateInput = Readonly<{
    // The workspace root (the dir carrying `.agents/.swarm-version`).
    workspaceDir: string;
    // A resolved kit source dir (a local `--from` path or a temp clone) carrying VERSION + the tree.
    kitSourceDir: string;
    // How a changed KIT-OWNED file is handled: `backup` (default — the user's edited copy preserved as
    // `*.swarm-bak`), `overwrite` (the kit's lands, the user's edit lost), or `skip` (the kit's change
    // is NOT applied; the pin stays behind so the next `--check` still flags it).
    policy: ConflictPolicy;
}>;

export type ApplyUpdateReport = Readonly<{
    level: OutcomeLevel;
    // false when the workspace was already up to date — nothing was written.
    applied: boolean;
    fromVersion: string;
    // The kit's latest version (what `--write` offers). Informational — the PIN only reaches it when
    // `pinAdvanced` is true (a `skip` that left a conflict un-applied keeps the pin at `fromVersion`).
    toVersion: string;
    // Whether the `.agents/.swarm-version` pin advanced to `toVersion`. False when a conflict was
    // skipped — the workspace is NOT fully at the new version, so the pin stays behind and the next
    // `swarm update --check` honestly still flags it.
    pinAdvanced: boolean;
    written: readonly string[];
    skipped: readonly string[];
    merged: readonly string[];
    backedUp: readonly string[];
    overwritten: readonly string[];
}>;

const NO_CHANGES = { written: [], skipped: [], merged: [], backedUp: [], overwritten: [] } as const;

// The kit-owned guidance an update refreshes — the guides, templates, gate hooks, advanced cards.
// Everything else the kit ships a SEED copy of (the board, README, CHANGELOG, VERSION, decisions/0001,
// examples/, the flow-folder READMEs) is the adopter's once they have a lived-in workspace, so `--write`
// leaves it untouched. The agent-tool skills symlinks (created at init) persist and need no refresh —
// the guides they point INTO live under `.agents/skills/`, which IS refreshed. Matched by path prefix
// (or exact, for a bare file). Mirrors ADOPTING.md's "re-copy templates/, .agents/skills/, hooks/".
const KIT_OWNED_PREFIXES = ['templates/', '.agents/skills/', 'advanced/', 'hooks/'] as const;

function is_kit_owned(rel: string): boolean {
    return KIT_OWNED_PREFIXES.some((prefix) => rel === prefix.replace(/\/$/, '') || rel.startsWith(prefix));
}

export function apply_update(input: ApplyUpdateInput): Result<ApplyUpdateReport, AppError> {
    const drift = check_update({ workspaceDir: input.workspaceDir, kitSourceDir: input.kitSourceDir });
    if (isErr(drift)) {
        return drift;
    }
    const { currentVersion, latestVersion, behind } = drift.value;

    // Already current: a `--write` here is an explicit no-op, not a re-copy of identical files. Exit
    // clean so a CI/scripted apply reads "nothing to do" rather than churn.
    if (!behind) {
        return ok({
            level: 'clean',
            applied: false,
            fromVersion: currentVersion,
            toVersion: latestVersion,
            pinAdvanced: false,
            ...NO_CHANGES,
        });
    }

    const copied = init_workspace({
        sourceDir: input.kitSourceDir,
        targetDir: input.workspaceDir,
        policy: input.policy,
        mode: 'workspace',
        pathFilter: is_kit_owned,
    });
    /* v8 ignore next 3 -- unreachable in practice: check_update above already proved the kit source
       exists and carries VERSION, so init_workspace's source-missing arm can't fire here, and the only
       other Err (a write failure mid-copy) is environment-specific. Surfaced anyway so a real EACCES
       routes through the Result channel rather than escaping as a stack trace. */
    if (isErr(copied)) {
        return copied;
    }
    const report = copied.value;

    // `--on-conflict skip` left a kit-owned change UN-applied, but `stamp_version` (inside the copy)
    // already advanced the pin to the new version — so the next `swarm update --check` would read
    // "up to date" while real drift remains. Restore the pin to the pre-apply version so a skipped
    // apply stays honestly "behind". (Backup/overwrite fully apply the change → the new pin is correct.)
    const skippedSomething = report.skipped.length > 0;
    if (skippedSomething) {
        writeFileSync(join(input.workspaceDir, '.agents', '.swarm-version'), `${currentVersion}\n`);
    }

    // A displaced user file (backed up) or an un-applied change (skipped) is what the adopter must
    // reconcile by hand — surface it as a warning (exit 1) so a `--write` is never read as silently
    // clean. A clean apply (only new files written / `.gitignore` merge / overwrites) exits clean.
    const needsReconcile = report.backedUp.length > 0 || skippedSomething;

    return ok({
        level: needsReconcile ? 'warning' : 'clean',
        applied: true,
        fromVersion: currentVersion,
        toVersion: latestVersion,
        pinAdvanced: !skippedSomething,
        written: report.written,
        skipped: report.skipped,
        merged: report.merged,
        backedUp: report.backedUp,
        overwritten: report.overwritten,
    });
}
