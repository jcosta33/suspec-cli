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
    verdict: 'clean' | 'blocking';
    specs: readonly { path: string; level: RenderLevel }[];
    workspaceFindings: readonly { code: string; message: string }[];
}): string {
    const verdict = report.verdict === 'clean' ? color.green('✓ clean') : color.red('✗ blocking');
    const lines = [`Workspace verdict: ${verdict}  ${color.dim(`${String(report.specs.length)} specs`)}`, ''];
    for (const spec of report.specs) {
        lines.push(`  ${format_verdict(spec.level)}  ${spec.path}`);
    }
    for (const finding of report.workspaceFindings) {
        lines.push(`  ${color.red('✗')}  ${color.bold(finding.code)}  ${finding.message}`);
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

export function format_worktrees(worktrees: readonly { branch: string; path: string; dirty: boolean }[]): string {
    if (worktrees.length === 0) {
        return color.dim('(no swarm worktrees)');
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
