#!/usr/bin/env node

// `corpus clean` — report spent ephemeral artifacts (SPEC-corpus-clean, ADR-0106 item 2). Read-only
// v0: list the tasks/reviews whose work reached a terminal status, so the operator can prune them by
// hand. The destructive `--apply` (delete the gitignored, archive the committed) is deferred until the
// prune-window policy is ratified (SPEC-corpus-clean D1); until then `--apply` prints that notice
// rather than acting. Writes nothing — the durable set (specs/findings/decisions/board) is never touched.
//   corpus clean            report spent ephemeral artifacts (report-only)
//   corpus clean --json     machine output
//   corpus clean --apply    (not wired yet — prints the deferral notice)

import { project, scan_clean_candidates } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { flags } = parse_flags(argv, { booleans: ['--json', '--apply'], strings: [] });
    const json = flags.get('json') === true;
    const apply = flags.get('apply') === true;

    return project({
        result: scan_clean_candidates({ workspaceDir: cwd }),
        json,
        render: (report) => {
            const lines = [
                `corpus clean — ${String(report.candidates.length)} prunable, ${String(report.keptCount)} kept (report-only v0)`,
            ];
            for (const candidate of report.candidates) {
                lines.push(`  ${candidate.path}  (${candidate.kind} status: ${candidate.status} — spent)`);
            }
            if (report.candidates.length === 0) {
                lines.push('  nothing spent — the ephemeral set is all live work.');
            }
            if (apply) {
                lines.push(
                    '  note: --apply is not wired yet — v0 reports only. Deletion + archive land once the ' +
                        'prune-window policy is ratified (SPEC-corpus-clean).'
                );
            }
            return lines.join('\n');
        },
    });
}
