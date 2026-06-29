#!/usr/bin/env node

// `suspec clean` — prune spent ephemeral artifacts (SPEC-suspec-clean, ADR-0106 item 2). Dry-run by
// default: it REPORTS the tasks/reviews whose work reached a terminal status. `--apply` prunes them —
// a GITIGNORED/untracked candidate is deleted (the working set, recoverable from the run); a COMMITTED
// one is moved under archive/ (ADR-0096). Touches ONLY spent tasks/reviews — never the durable set
// (specs/findings/decisions/board).
//   suspec clean            report spent ephemeral artifacts (dry run)
//   suspec clean --apply    prune them — delete gitignored, archive committed (needs a git repo)
//   suspec clean --json     machine output

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, scan_clean_candidates, apply_clean } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { flags } = parse_flags(argv, { booleans: ['--json', '--apply'], strings: [] });
    const json = flags.get('json') === true;
    const apply = flags.get('apply') === true;

    const scan = scan_clean_candidates({ workspaceDir: cwd });

    // `--apply` prunes. It needs a git repo to tell a gitignored file (delete) from a committed one
    // (archive) — without that distinction it cannot prune safely, so it refuses rather than guess.
    if (apply) {
        /* v8 ignore next 3 -- scan_clean_candidates only ever returns ok (a pure filesystem read); the guard is defensive */
        if (isErr(scan)) {
            return emit_error(scan.error, json);
        }
        const rootResult = resolve_repo_root(cwd);
        if (isErr(rootResult)) {
            return emit_error(rootResult.error, json);
        }
        return project({
            result: apply_clean({ workspaceDir: cwd, repoRoot: rootResult.value, candidates: scan.value.candidates }),
            json,
            render: (result) => {
                const lines = [
                    `suspec clean --apply — ${String(result.deleted.length)} deleted, ${String(result.archived.length)} archived`,
                ];
                for (const path of result.deleted) {
                    lines.push(`  deleted   ${path}  (gitignored — recoverable from the run)`);
                }
                for (const path of result.archived) {
                    lines.push(`  archived  ${path}  → archive/${path}  (committed — kept in the tree)`);
                }
                if (result.deleted.length === 0 && result.archived.length === 0) {
                    lines.push('  nothing spent — the ephemeral set is all live work.');
                }
                return lines.join('\n');
            },
        });
    }

    return project({
        result: scan,
        json,
        render: (report) => {
            const lines = [
                `suspec clean — ${String(report.candidates.length)} prunable, ${String(report.keptCount)} kept (dry run; --apply to prune)`,
            ];
            for (const candidate of report.candidates) {
                lines.push(`  ${candidate.path}  (${candidate.kind} status: ${candidate.status} — spent)`);
            }
            if (report.candidates.length === 0) {
                lines.push('  nothing spent — the ephemeral set is all live work.');
            }
            return lines.join('\n');
        },
    });
}
