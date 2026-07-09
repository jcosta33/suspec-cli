#!/usr/bin/env node

// `suspec review <RUN>` — run-vs-spec reconciliation over STORE artifacts (SPEC-suspec-v2 AC-013,
// ADR-0137). Two read-only layers, facts only, NO verdict:
//   1. artifact lint — the deterministic checks over the run's store artifacts: the driving spec
//      (contract spec checks), the review packet if one exists (C012 coverage / C013 binding /
//      C016, keyed on the spec's full AC set), the run record, and every evidence record (a forged
//      cli-verified claim is a hard error).
//   2. evidence-vs-spec reconcile — every AC in the driving spec against the run's evidence
//      records (verified / stale / failing / missing per AC), the same rows `done` gates on —
//      so review shows exactly what the gate will say, without closing anything.
//   suspec review <RUN>          reconcile the store run (read-only)
//   suspec review --json         machine output · `-i` picks a run interactively
// Exit: 0 clean · 1 findings/gaps to look at · 2 usage / no such run / a lint hard-error.

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    is_safe_segment,
    resolve_store_dir,
    lint_run_artifacts,
    list_evidence_records,
    verify_evidence_capture,
    gate_evidence,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, worktree_diff_digest } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_store_lint, run_review_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const runRef = positional[0];

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || runRef === undefined) && process.stdout.isTTY === true && !json) {
        return run_review_flow(create_clack_prompter(), { cwd });
    }
    /* v8 ignore stop */

    if (runRef === undefined) {
        return emit_error(usage_error('usage: suspec review <RUN> [--json] — a store run slug (run-<RUN>.md)'), json);
    }
    // A run ref is a slug, never a path — reject traversal at the boundary.
    if (!is_safe_segment(runRef)) {
        return emit_error(usage_error(`invalid run ref "${runRef}": expected a run slug, not a path`), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // Probe-only: review never creates the store it reads.
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return emit_error(
            usage_error('no store for this repo yet — nothing to review (a run appears after `suspec work`)'),
            json
        );
    }
    const storeDir = store.value.storeDir;

    const lint = lint_run_artifacts({ storeDir, repoRoot, runSlug: runRef });
    if (isErr(lint)) {
        return emit_error(lint.error, json);
    }

    // The evidence-vs-spec rows (the same policy table `done` gates on — review previews it).
    // No requirements (unresolvable/AC-less spec) → no rows; the lint diagnostics already say why.
    const records = list_evidence_records(storeDir, runRef);
    const gate =
        lint.value.requirements !== null
            ? gate_evidence({
                  requirements: lint.value.requirements,
                  records,
                  allowAgentEvidence: false,
                  captureVerified: (record) => verify_evidence_capture(storeDir, runRef, record),
                  isStale: (record) => {
                      if (record.worktreeDiffSha === null || record.worktree === null) {
                          return true;
                      }
                      return worktree_diff_digest(record.worktree) !== record.worktreeDiffSha;
                  },
              })
            : null;

    const gaps = gate !== null ? gate.gaps.length : 0;
    // Facts raise the advisory level, never a verdict: lint hard-errors stay blocking (exit 2);
    // otherwise any gap or lint warning reads warning (exit 1); a fully evidenced clean run exits 0.
    let level = lint.value.level;
    if (level === 'clean' && gaps > 0) {
        level = 'warning';
    }

    return project({
        result: {
            ok: true,
            value: {
                level,
                runSlug: runRef,
                specId: lint.value.specId,
                lint: lint.value.artifacts,
                evidence: gate !== null ? gate.rows : [],
                gaps: gate !== null ? gate.gaps.map((row) => row.ac) : [],
            },
        },
        json,
        render: (value) => {
            const lines = [
                `review ${value.runSlug} · spec ${value.specId ?? 'unknown'} — facts, no verdict (a human owns the result)`,
                format_store_lint({ level: lint.value.level, artifacts: lint.value.artifacts }),
            ];
            if (gate !== null) {
                lines.push('', 'evidence vs spec ACs:');
                for (const row of gate.rows) {
                    const command = row.command ?? '(no command recorded)';
                    lines.push(`  ${row.ac}  ${row.status}  ${command}`);
                }
                lines.push(
                    gaps === 0
                        ? '  every AC has fresh cli-verified evidence — `suspec done` would pass this gate.'
                        : `  ${String(gaps)} AC(s) short of the gate — capture with \`suspec evidence add ${value.runSlug} --ac <AC> -- <command>\`.`
                );
            }
            return lines.join('\n');
        },
    });
}
