// The check-report renderer — turns an engine report into the coloured, feedback-rich text the
// check command prints. Pure (data in, string out) so it is unit-testable; colour comes from
// picocolors, which no-ops when output is not a TTY. Input types are local and structural (model
// isolation) — the command passes the engine report fields.

import color from 'picocolors';

export type RenderLevel = 'clean' | 'warning' | 'blocking';
export type RenderDiagnostic = Readonly<{
    code: string;
    severity: 'hard-error' | 'warning';
    message: string;
    line: number | null;
}>;

export function format_level(level: RenderLevel): string {
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

function format_count(count: number, noun: string): string {
    return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function format_check_report(report: {
    path: string;
    level: RenderLevel;
    diagnostics: readonly RenderDiagnostic[];
}): string {
    const errors = report.diagnostics.filter((d) => d.severity === 'hard-error').length;
    const warnings = report.diagnostics.length - errors;
    const head = `${color.bold(report.path)}  ${format_level(report.level)}  ${color.dim(`${format_count(errors, 'error')}, ${format_count(warnings, 'warning')}`)}`;
    if (report.diagnostics.length === 0) {
        return head;
    }
    return [head, '', ...report.diagnostics.map(format_diagnostic)].join('\n');
}
