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

// The store artifact lint (SPEC-suspec-v2 AC-013 / ADR-0137): per-artifact facts, no verdict
// beyond the shared severity level. Shared by `suspec check` (no args), `suspec review <RUN>`,
// and their interactive flows.
export function format_store_lint(report: {
    level: RenderLevel;
    artifacts: readonly {
        path: string;
        diagnostics: readonly { check: string; severity: 'hard-error' | 'warning'; message: string }[];
    }[];
}): string {
    const all = report.artifacts.flatMap((artifact) => artifact.diagnostics);
    const errors = all.filter((diagnostic) => diagnostic.severity === 'hard-error').length;
    const lines = [
        `store lint  ${format_verdict(report.level)}  ${color.dim(`${String(report.artifacts.length)} artifact(s), ${String(errors)} errors, ${String(all.length - errors)} warnings`)}`,
    ];
    for (const artifact of report.artifacts) {
        if (artifact.diagnostics.length === 0) {
            lines.push(`  ${color.green('✓')}  ${artifact.path}`);
            continue;
        }
        lines.push(`  ${color.bold(artifact.path)}`);
        for (const diagnostic of artifact.diagnostics) {
            const icon = diagnostic.severity === 'hard-error' ? color.red('✗') : color.yellow('⚠');
            lines.push(`    ${icon}  ${color.bold(diagnostic.check)}  ${diagnostic.message}`);
        }
    }
    if (report.artifacts.length === 0) {
        lines.push(color.dim('  (no lintable artifacts in the store)'));
    }
    return lines.join('\n');
}

// `suspec status` — the store summary (runs/specs + the `next` attention list). The board is gone
// (ADR-0137): status reads the store, never a workspace tree.
export function format_store_status(report: {
    active: readonly { filename: string; kind: string; ageDays: number }[];
    archived: readonly { filename: string; kind: string; ageDays: number }[];
    next: readonly { rank: number; detail: string; action: string }[];
}): string {
    const lines: string[] = [
        `store — ${String(report.active.length)} active artifact(s), ${String(report.archived.length)} archived`,
    ];
    for (const artifact of report.active) {
        lines.push(
            `  ${color.bold(artifact.kind.padEnd(7))} ${artifact.filename}  ${color.dim(`${String(artifact.ageDays)}d`)}`
        );
    }
    if (report.active.length === 0) {
        lines.push(color.dim('  (no active artifacts — `suspec write spec "<intent>"` starts one)'));
    }
    if (report.next.length > 0) {
        lines.push('', color.bold('attention:'));
        for (const item of report.next) {
            lines.push(`  ${color.yellow('⚠')}  ${item.detail}`);
            lines.push(`     ${color.dim(`→ ${item.action}`)}`);
        }
    }
    return lines.join('\n');
}

export function format_worktrees(worktrees: readonly { branch: string; path: string; dirty: boolean }[]): string {
    if (worktrees.length === 0) {
        return color.dim('(no suspec worktrees)');
    }
    return worktrees
        .map(
            (wt) =>
                `  ${color.bold(wt.branch)}  ${color.dim(wt.path)}  ${wt.dirty ? color.yellow('dirty') : color.green('clean')}`
        )
        .join('\n');
}

// `suspec init`'s seed report (SPEC-suspec-v2 AC-024): what was created, what was extended, what
// already existed and was left alone.
export function format_seed_report(report: {
    created: readonly string[];
    updated: readonly string[];
    kept: readonly string[];
}): string {
    const line = (label: string, items: readonly string[], paint: (s: string) => string) =>
        items.length > 0 ? `  ${paint(label)}: ${items.join(', ')}` : null;
    return [
        'seeded this repo for Suspec (artifacts live in your personal store, outside the repo)',
        line('created', report.created, color.green),
        line('updated', report.updated, color.cyan),
        line('kept', report.kept, color.dim),
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
        '\n\nrun `suspec update --write` to apply, or re-copy / cherry-pick the changed kit rules by hand'
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
    // A backed-up user file now lives at `<file>.suspec-bak` and the kit's version is in place — the
    // adopter reconciles by hand. Surface that as the closing note so a `--write` is never read as
    // "your edits are gone". (Backup takes precedence — a run mixing both reports the destructive-ish
    // case first.)
    const reconcile_note = (): string => {
        if (report.backedUp.length > 0) {
            return color.dim('\n\nyour prior versions are saved as `*.suspec-bak` — reconcile and delete them');
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
