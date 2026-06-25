// Pure renderers for the interactive surface — they turn engine reports into the coloured,
// feedback-rich text the flows show (via the Prompter's note/log). Kept pure (data in, string out)
// so they are unit-testable; colour comes from picocolors, which no-ops when output is not a TTY.
// Input types are local and structural (model isolation) — the flows pass the engine report fields.

import color from 'picocolors';

export type RenderLevel = 'clean' | 'warning' | 'blocking';
export type RenderDiagnostic = Readonly<{
    code: string;
    severity: 'hard-error' | 'warning';
    message: string;
    line: number | null;
}>;

export function format_verdict(level: RenderLevel): string {
    if (level === 'clean') {
        return color.green('✓ clean');
    }
    if (level === 'warning') {
        return color.yellow('⚠ warning');
    }
    return color.red('✗ blocking');
}

function format_diagnostic(diagnostic: RenderDiagnostic): string {
    const icon = diagnostic.severity === 'hard-error' ? color.red('✗') : color.yellow('⚠');
    const where = diagnostic.line !== null ? color.dim(` :${String(diagnostic.line)}`) : '';
    return `  ${icon}  ${color.bold(diagnostic.code)}  ${diagnostic.message}${where}`;
}

export function format_check_report(report: {
    path: string;
    level: RenderLevel;
    diagnostics: readonly RenderDiagnostic[];
}): string {
    const errors = report.diagnostics.filter((d) => d.severity === 'hard-error').length;
    const warnings = report.diagnostics.length - errors;
    const head = `${color.bold(report.path)}  ${format_verdict(report.level)}  ${color.dim(`${String(errors)} errors, ${String(warnings)} warnings`)}`;
    if (report.diagnostics.length === 0) {
        return head;
    }
    return [head, '', ...report.diagnostics.map(format_diagnostic)].join('\n');
}

export function format_workspace_report(report: {
    level: RenderLevel;
    specs: readonly { path: string; level: RenderLevel; diagnostics: readonly RenderDiagnostic[] }[];
    changePlans?: readonly { path: string; level: RenderLevel; diagnostics: readonly RenderDiagnostic[] }[];
    workspaceFindings: readonly { code: string; message: string; level?: string }[];
}): string {
    const changePlans = report.changePlans ?? [];
    // Render the 3-way severity (clean / warning / blocking), not the binary merge `verdict`, so a
    // warnings-only workspace shows "⚠ warning" (exit 1) instead of a misleading "✓ clean".
    const lines = [
        `Workspace verdict: ${format_verdict(report.level)}  ${color.dim(`${String(report.specs.length)} specs, ${String(changePlans.length)} change plans`)}`,
        '',
    ];
    for (const spec of report.specs) {
        lines.push(`  ${format_verdict(spec.level)}  ${spec.path}`);
        // Show each spec's diagnostics (which check failed, at which line) — the gate's human surface,
        // matching the change-plan branch below and the --json envelope; otherwise a `✗ blocking spec`
        // gives the reviewer no way to see the defect without re-running per file (#37).
        for (const diagnostic of spec.diagnostics) {
            lines.push(format_diagnostic(diagnostic));
        }
    }
    // Change plans (C010/C011) fold into the same verdict; show each plan's level and its findings so
    // a blocking C010 is visible, not just reflected in the aggregate verdict.
    for (const plan of changePlans) {
        lines.push(`  ${format_verdict(plan.level)}  ${plan.path}`);
        for (const diagnostic of plan.diagnostics) {
            lines.push(format_diagnostic(diagnostic));
        }
    }
    for (const finding of report.workspaceFindings) {
        // A warning-level finding (an unfilled day-one AGENTS.md placeholder, SW-006) shows ⚠ not a red
        // ✗ — it nudges the user to finish setup without failing the merge gate on the kit's boilerplate.
        const icon = finding.level === 'warning' ? color.yellow('⚠') : color.red('✗');
        lines.push(`  ${icon}  ${color.bold(finding.code)}  ${finding.message}`);
    }
    return lines.join('\n');
}

export function format_board(board: {
    specs: readonly {
        id: string;
        status: string;
        tasks: readonly { id: string; status: string; hasReview: boolean; reviewStatus: string | null }[];
    }[];
    tasksWithoutReview: readonly string[];
    needsHuman: readonly string[];
}): string {
    const lines: string[] = [];
    for (const spec of board.specs) {
        lines.push(`${color.bold(spec.id)}  ${color.dim(spec.status)}`);
        for (const task of spec.tasks) {
            const review = task.hasReview
                ? color.green(`review: ${task.reviewStatus ?? ''}`)
                : color.yellow('no review');
            lines.push(`  • ${task.id}  ${color.dim(task.status)}  ${review}`);
        }
    }
    if (board.tasksWithoutReview.length > 0) {
        lines.push('', color.yellow(`Awaiting review: ${board.tasksWithoutReview.join(', ')}`));
    }
    if (board.needsHuman.length > 0) {
        lines.push(color.red(`Needs human: ${board.needsHuman.join(', ')}`));
    }
    return lines.length > 0 ? lines.join('\n') : color.dim('(no specs yet)');
}

// The `corpus review` reconcile report (M2). Surfaces FACTS and routes to Human attention — never a
// Pass/Fail/Unverified/Blocked result, never a merge decision (ADR-0077 Decision 8 / AC-023). The
// input is structural (the engine report's fields); colour comes from picocolors.
export type RenderReviewReport = Readonly<{
    level: RenderLevel;
    task: string;
    diffChangedFiles: readonly string[];
    coverage: readonly { id: string; kind: 'uncovered' | 'orphan'; message: string }[];
    verifyBinding: readonly {
        id: string;
        kind: 'cmd-mismatch' | 'result-fail' | 'malformed' | 'duplicate' | 'free-form-only';
        message: string;
    }[];
    scopeDivergence: readonly string[];
    selfReport: Readonly<{
        claimedNotInDiff: readonly string[];
        inDiffNotClaimed: readonly string[];
        outsideScope: readonly string[];
        runSummaryUnparsed: boolean;
    }>;
    doNotChangeTouched: readonly string[];
    emptyEvidencePassRows: readonly string[];
    packetStructural: Readonly<{
        badResultCells: readonly string[];
        badStatus: string | null;
        statusPassContradicted: boolean;
        missingSections: readonly string[];
    }>;
    packetSize: Readonly<{ changedLoc: number; filesTouched: number }> | null;
    // Spec-coverage drift (corpus-cli#1) — NEUTRAL INFO, surfaced dim like the size note, never a ⚠
    // finding (the engine keeps it out of the advisory level until measured + promoted). null = no drift.
    specCoverageDrift: Readonly<{
        specCount: number;
        trackedCount: number;
        untracked: readonly string[];
        message: string;
    }> | null;
    hasReviewPacket: boolean;
}>;

export function format_review_report(report: RenderReviewReport): string {
    // The diff size is NEUTRAL INFO (generated/vendored excluded) — surfaced so the reviewer can judge
    // decomposition themselves; it is never a finding (the oversized band is specified-not-shipped,
    // ADR-0097). Falls back to the name-only file count when no LOC stats were available.
    const sizeNote = report.packetSize
        ? `${String(report.packetSize.changedLoc)} LOC across ${String(report.packetSize.filesTouched)} files`
        : `${String(report.diffChangedFiles.length)} changed files`;
    const lines: string[] = [
        `${color.bold(`review ${report.task}`)}  ${format_verdict(report.level)}  ${color.dim(sizeNote)}`,
    ];

    const bullet = (message: string) => lines.push(`  ${color.yellow('⚠')}  ${message}`);

    if (!report.hasReviewPacket) {
        lines.push(`  ${color.dim('no review packet yet — every in-scope requirement reads uncovered')}`);
    }
    for (const finding of report.coverage) {
        bullet(`${color.bold(`C012 ${finding.kind}`)}  ${finding.message}`);
    }
    for (const finding of report.verifyBinding) {
        bullet(`${color.bold(`C013 ${finding.kind}`)}  ${finding.message}`);
    }
    for (const id of report.scopeDivergence) {
        bullet(`${color.bold('scope≠spec')}  scope id ${id} is not defined in the source spec`);
    }
    for (const path of report.selfReport.claimedNotInDiff) {
        bullet(`${color.bold('claimed-not-changed')}  Run summary claims ${path} but the diff does not show it`);
    }
    for (const path of report.selfReport.inDiffNotClaimed) {
        bullet(`${color.bold('changed-not-claimed')}  ${path} changed but the Run summary never mentions it`);
    }
    if (report.selfReport.runSummaryUnparsed) {
        lines.push(
            `  ${color.dim('run summary lists no machine-checkable file paths — selfReport reconcile skipped (list changed files as backticked paths to enable it)')}`
        );
    }
    for (const path of report.selfReport.outsideScope) {
        bullet(`${color.bold('outside-scope')}  ${path} changed but is outside the declared Affected areas`);
    }
    for (const path of report.doNotChangeTouched) {
        bullet(`${color.bold('do-not-change')}  ${path} changed but the task lists it under Do not change`);
    }
    for (const id of report.emptyEvidencePassRows) {
        bullet(`${color.bold('empty-evidence')}  coverage row ${id} is Pass with empty Evidence — reads Unverified`);
    }
    for (const id of report.packetStructural.badResultCells) {
        bullet(
            `${color.bold('bad-result')}  coverage row ${id} has a Result outside {Pass, Fail, Unverified, Blocked}`
        );
    }
    if (report.packetStructural.badStatus !== null) {
        bullet(
            `${color.bold('bad-status')}  frontmatter status "${report.packetStructural.badStatus}" is not a recognized review status`
        );
    }
    if (report.packetStructural.statusPassContradicted) {
        bullet(`${color.bold('status-contradicted')}  status: pass but a coverage row is not Pass`);
    }
    for (const section of report.packetStructural.missingSections) {
        bullet(`${color.bold('missing-section')}  the review packet has no "${section}" section`);
    }
    // Spec-coverage drift: dim NEUTRAL line (like the size note), never a ⚠ finding — the spec grew
    // under the task and the reviewer decides whether the untracked ids belong in this run (corpus-cli#1).
    if (report.specCoverageDrift !== null) {
        lines.push(`  ${color.dim(`spec-coverage drift — ${report.specCoverageDrift.message}`)}`);
    }

    if (lines.length === 1) {
        lines.push(color.dim('  clean reconcile — no facts to route. A human still owns the review result.'));
    }
    return lines.join('\n');
}

export function format_worktrees(worktrees: readonly { branch: string; path: string; dirty: boolean }[]): string {
    if (worktrees.length === 0) {
        return color.dim('(no corpus worktrees)');
    }
    return worktrees
        .map(
            (wt) =>
                `  ${color.bold(wt.branch)}  ${color.dim(wt.path)}  ${wt.dirty ? color.yellow('dirty') : color.green('clean')}`
        )
        .join('\n');
}

export function format_init_report(report: {
    mode: string;
    written: readonly string[];
    skipped: readonly string[];
    merged: readonly string[];
    backedUp: readonly string[];
    overwritten: readonly string[];
}): string {
    const line = (label: string, items: readonly string[], paint: (s: string) => string) =>
        items.length > 0 ? `  ${paint(label)}: ${items.join(', ')}` : null;
    return [
        `init (${report.mode})`,
        line('written', report.written, color.green),
        line('merged', report.merged, color.cyan),
        line('backed up', report.backedUp, color.cyan),
        line('overwritten', report.overwritten, color.yellow),
        line('skipped', report.skipped, color.yellow),
    ]
        .filter((entry): entry is string => entry !== null)
        .join('\n');
}

export function format_update_report(report: {
    behind: boolean;
    currentVersion: string;
    latestVersion: string;
    changelog: string | null;
}): string {
    if (!report.behind) {
        return `${color.green('✓ up to date')} — kit ${color.bold(report.currentVersion)}`;
    }
    const head = `${color.yellow('⚠ behind')} — ${color.bold(report.currentVersion)} ${color.dim('→')} ${color.bold(
        report.latestVersion
    )}`;
    const tail = report.changelog !== null ? `\n\n${color.dim('CHANGELOG:')}\n${report.changelog}` : '';
    const note = color.dim(
        '\n\nrun `corpus update --write` to apply, or re-copy / cherry-pick the changed kit rules by hand'
    );
    return `${head}${tail}${note}`;
}

export function format_apply_report(report: {
    applied: boolean;
    fromVersion: string;
    toVersion: string;
    pinAdvanced: boolean;
    written: readonly string[];
    skipped: readonly string[];
    merged: readonly string[];
    backedUp: readonly string[];
    overwritten: readonly string[];
}): string {
    if (!report.applied) {
        return `${color.green('✓ already up to date')} — kit ${color.bold(report.toVersion)} (nothing applied)`;
    }
    const line = (label: string, items: readonly string[], paint: (s: string) => string) =>
        items.length > 0 ? `  ${paint(label)}: ${items.join(', ')}` : null;
    // A backed-up user file now lives at `<file>.corpus-bak` and the kit's version is in place — the
    // adopter reconciles by hand. Surface that as the closing note so a `--write` is never read as
    // "your edits are gone". (Backup takes precedence — a run mixing both reports the destructive-ish
    // case first.)
    const reconcile_note = (): string => {
        if (report.backedUp.length > 0) {
            return color.dim('\n\nyour prior versions are saved as `*.corpus-bak` — reconcile and delete them');
        }
        if (report.skipped.length > 0) {
            return color.dim(
                '\n\nskipped files kept your version — the kit change was NOT applied (--on-conflict skip)'
            );
        }
        return '';
    };
    // When a conflict was skipped the pin did NOT advance — never paint "✓ updated → Y" (it would
    // contradict the still-behind pin). Say the pin stayed put and name the kit version on offer.
    const head = report.pinAdvanced
        ? `${color.green('✓ updated')} — ${color.bold(report.fromVersion)} ${color.dim('→')} ${color.bold(
              report.toVersion
          )}`
        : `${color.yellow('⚠ partial')} — kept at ${color.bold(report.fromVersion)} (conflicts skipped; kit is at ${color.bold(
              report.toVersion
          )})`;
    return [
        head,
        line('written', report.written, color.green),
        line('merged', report.merged, color.cyan),
        line('backed up', report.backedUp, color.cyan),
        line('overwritten', report.overwritten, color.yellow),
        line('skipped', report.skipped, color.yellow),
    ]
        .filter((entry): entry is string => entry !== null)
        .join('\n')
        .concat(reconcile_note());
}
