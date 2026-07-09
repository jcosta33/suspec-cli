#!/usr/bin/env node

// `suspec store <doctor|list|gc|purge>` — structural anti-rot (SPEC-suspec-v2 AC-018/AC-020).
//   doctor   reconcile-only sweep: terminal states derive from git/GitHub truth — a spec/run whose
//            branch is merged, whose worktree is gone, or whose PR is closed is ARCHIVED (moved,
//            never deleted); orphans (branch/worktree never existed) are listed. Exit 0 always —
//            a reconciler, not a gate. gh absent → the PR checks are skipped with a note.
//   list     active + archived artifacts with per-artifact age (days). Read-only.
//   gc       delete ONLY archive/ items older than the retention window (retention_days in
//            suspec.config.json, default 30) — prints what died.
//   purge    delete the repo's WHOLE store dir — requires typing the repo name at the prompt, or
//            --force; refuses outside a TTY without --force.
//   suspec store <sub> [--json] · purge [--force]
// Exits: doctor/list/gc 0 (plus 2 on a hard I/O error) · purge 0 done / 2 refused.

import { basename } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    resolve_store_dir,
    read_store_settings,
    store_doctor,
    list_store_artifacts,
    gc_store,
    purge_store,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, probe_pr_state } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { create_clack_prompter, is_cancelled, type Prompter } from '../../Tui/useCases/index.ts';

const USAGE = 'usage: suspec store <doctor|list|gc|purge> [--json] · purge also takes --force';

const SUBCOMMANDS = new Set(['doctor', 'list', 'gc', 'purge']);

export async function run(argv: string[], cwd: string = process.cwd(), prompter?: Prompter): Promise<number> {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json', '--force'], strings: [] });
    const json = flags.get('json') === true;
    const force = flags.get('force') === true;
    const sub = positional[0];

    if (sub === undefined || !SUBCOMMANDS.has(sub)) {
        return emit_error(usage_error(USAGE), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // Probe-only for every subcommand: maintenance never creates the store it maintains.
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return project({
            result: { ok: true, value: { level: 'clean' as const, store: null, note: 'no store' } },
            json,
            render: () => `no store for this repo yet — nothing to ${sub}`,
        });
    }
    const storeDir = store.value.storeDir;

    if (sub === 'doctor') {
        const report = store_doctor({ storeDir, repoRoot, prState: (branch) => probe_pr_state(branch, repoRoot) });
        return project({
            result: report,
            json,
            notes: isErr(report) ? [] : report.value.notes,
            render: (v) =>
                [
                    `store doctor — ${v.storeDir} (default branch: ${v.defaultBranch})`,
                    ...(v.artifacts.length === 0 ? ['  nothing active to reconcile'] : []),
                    ...v.artifacts.map(
                        (row) => `  ${row.filename}: ${row.signal ?? 'no signal'} → ${row.action} (${row.detail})`
                    ),
                    ...(v.orphans.length > 0
                        ? ['', 'orphans (never had a branch/worktree — left in place):', ...v.orphans.map((o) => `  ${o}`)]
                        : []),
                ].join('\n'),
        });
    }

    if (sub === 'list') {
        const listing = list_store_artifacts(storeDir);
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    store: storeDir,
                    active_count: listing.active.length,
                    archived_count: listing.archived.length,
                    active: listing.active,
                    archived: listing.archived,
                },
            },
            json,
            render: (v) =>
                [
                    `store — ${v.store}`,
                    `  active: ${v.active_count}`,
                    ...v.active.map((a) => `    ${a.filename}  (${a.kind}, ${a.ageDays}d)`),
                    `  archived: ${v.archived_count}`,
                    ...v.archived.map((a) => `    archive/${a.filename}  (${a.kind}, ${a.ageDays}d)`),
                ].join('\n'),
        });
    }

    if (sub === 'gc') {
        const retentionDays = read_store_settings(repoRoot).retentionDays;
        const swept = gc_store({ storeDir, retentionDays });
        if (isErr(swept)) {
            return emit_error(swept.error, json);
        }
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    store: storeDir,
                    retention_days: retentionDays,
                    deleted: swept.value.deleted,
                },
            },
            json,
            render: (v) =>
                v.deleted.length === 0
                    ? `store gc — nothing archived is past the ${v.retention_days}d retention`
                    : [
                          `store gc — deleted ${v.deleted.length} archived artifact(s) past the ${v.retention_days}d retention:`,
                          ...v.deleted.map((d) => `  archive/${d.filename}  (${d.ageDays}d old)`),
                      ].join('\n'),
        });
    }

    // purge — the only whole-store delete, gated on an explicit human confirmation (AC-020).
    const repoName = basename(repoRoot);
    if (!force) {
        /* v8 ignore next 2 -- the TTY default constructs the real clack prompter; tests inject the mock */
        const interactive =
            prompter ?? (process.stdout.isTTY === true && !json ? create_clack_prompter() : null);
        if (interactive === null) {
            return emit_error(
                usage_error(`refusing to purge outside a TTY — re-run with --force to delete ${storeDir}`),
                json
            );
        }
        const typed = await interactive.text({
            message: `type the repo name ("${repoName}") to delete its whole store at ${storeDir}`,
        });
        if (is_cancelled(typed) || typed !== repoName) {
            return emit_error(
                usage_error(`purge aborted — the typed name did not match "${repoName}"; nothing deleted`),
                json
            );
        }
    }
    const purged = purge_store(storeDir);
    if (isErr(purged)) {
        return emit_error(purged.error, json);
    }
    return project({
        result: { ok: true, value: { level: 'clean' as const, removed: purged.value.removed } },
        json,
        render: (v) => `purged the store — deleted ${v.removed}`,
    });
}
