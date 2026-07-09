#!/usr/bin/env node

// `suspec review <task>` — the reconcile engine's diff-touching command surface (M2,
// AC-017/024/026/027). Thin: resolve a finished run from a task id/slug (its worktree, its diff, its
// source spec, its task packet, its review packet if one exists), call the read-only engine, and
// project the reconcile facts to text / `--json` under the advisory exit posture (AC-024). It writes
// nothing (AC-025) and spawns no agent (AC-026); `--agent` is reserved for M3 and rejected here.
//   suspec review <task>            reconcile the finished run for <task> (read-only, M2)
//   suspec review <task> --repo <p> reconcile when the code lives in a SEPARATE repo from the workspace
//   suspec review <task> --write    write a DRAFT reviews/<slug>.md from the reconcile (W4b)
//   suspec review                   (TTY) enter the interactive flow (AC-027)
//   suspec review --json            machine output, never prompts
//
// `--write` (W4b, AC-001) is opt-in: WITHOUT it the command stays exactly M2's read-only stdout
// reconcile. WITH it the command renders a `status: draft`, all-Unverified draft packet from the same
// reconcile and writes exactly that one file, no-clobber (AC-004 — an existing packet needs `--force`).

import { isErr } from '../../../infra/errors/result.ts';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import {
    project,
    emit_error,
    usage_error,
    resolve_review_run,
    resolve_review_run_by_spec,
    resolve_task,
    reconcile_review,
    draft_review_packet,
    task_slug,
    is_safe_segment,
    resolve_store_dir,
    run_filename,
    lint_run_artifacts,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, write_new_file } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_review_report, run_review_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--write', '--force'],
        strings: ['--base', '--repo'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const write = flags.get('write') === true;
    const force = flags.get('force') === true;
    const task = positional[0];

    // AC-026: `--agent` is reserved for M3 (agent-assisted evidence). M2 is the mechanical reconcile —
    // reject it rather than silently ignoring the flag, so it is not a recognized M2 invocation. Catch
    // both the space form (`--agent x`) and the equals form (`--agent=x`) — the latter is a distinct
    // argv element that `includes('--agent')` would miss (#25).
    if (argv.some((a) => a === '--agent' || a.startsWith('--agent='))) {
        return emit_error(
            usage_error('`suspec review --agent` is not available — M2 is the mechanical reconcile'),
            json
        );
    }

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || task === undefined) && process.stdout.isTTY === true && !json) {
        return run_review_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    if (task === undefined) {
        return emit_error(
            usage_error('usage: suspec review <task> [--base <branch>] [--repo <code-repo>] [--json]'),
            json
        );
    }

    // A review target is a task id or spec slug, never a path — reject traversal at the boundary so the
    // `reviews/<slug>.md` write below (slug = task_slug(task)) can never escape reviews/ even when a
    // malicious spec's frontmatter `id:` string-equals the raw arg (defense-in-depth over the resolver guards).
    if (!is_safe_segment(task)) {
        return emit_error(
            usage_error(`invalid review target "${task}": expected a task id or spec slug, not a path`),
            json
        );
    }

    // AC-013 (SPEC-suspec-v2): a ref that resolves to a STORE RUN takes the artifact-lint face —
    // the deterministic checks re-aimed at the run's store artifacts, per-artifact facts, exit per
    // check severity, NO workspace verdict. The store is PROBED (never created) so a repo that
    // never launched a store run falls through to the legacy workspace reconcile untouched.
    const cwdRepo = resolve_repo_root(cwd);
    if (!isErr(cwdRepo)) {
        const probed = resolve_store_dir({ repoRoot: cwdRepo.value, probe: true });
        if (!isErr(probed) && existsSync(join(probed.value.storeDir, run_filename(task)))) {
            return project({
                result: lint_run_artifacts({
                    storeDir: probed.value.storeDir,
                    repoRoot: cwdRepo.value,
                    runSlug: task,
                }),
                json,
                render: (value) =>
                    [
                        `artifact lint — run ${value.runSlug} · spec ${value.specId ?? 'unknown'} (facts, no verdict)`,
                        ...value.artifacts.flatMap((artifact) =>
                            artifact.diagnostics.length > 0
                                ? [
                                      `  ${artifact.path}`,
                                      ...artifact.diagnostics.map(
                                          (diagnostic) =>
                                              `    ${diagnostic.check} ${diagnostic.severity}: ${diagnostic.message}`
                                      ),
                                  ]
                                : [`  ${artifact.path} — clean`]
                        ),
                    ].join('\n'),
            });
        }
    }

    // The git repo whose worktree + diff this run lives in. Defaults to the workspace's own repo (the
    // co-located layout). `--repo <path>` points at a SEPARATE code repo so review works when the Suspec
    // workspace and the code are distinct git repos (the documented dedicated-workspace layout).
    const repoFlag = flags.get('repo');
    if (typeof repoFlag === 'string' && repoFlag.startsWith('-')) {
        return emit_error(usage_error(`invalid --repo value: "${repoFlag}" — expected a path to the code repo`), json);
    }
    let repoRoot: string;
    if (typeof repoFlag === 'string') {
        repoRoot = resolve(cwd, repoFlag);
    } else {
        const rootResult = resolve_repo_root(cwd);
        if (isErr(rootResult)) {
            return emit_error(rootResult.error, json);
        }
        repoRoot = rootResult.value;
    }

    const baseFlag = flags.get('base');
    if (typeof baseFlag === 'string' && baseFlag.startsWith('-')) {
        return emit_error(usage_error(`invalid --base value: "${baseFlag}" — expected a branch or commit`), json);
    }
    const base = typeof baseFlag === 'string' ? baseFlag : undefined;

    // Review-to-spec (ADR-0103): if the arg resolves to a task, reconcile the task run (task-keyed,
    // worktree diff). Otherwise treat it as a SPEC id/slug and reconcile the task-less 1:1 review —
    // coverage on the spec's full ACs, self-report from its `## Execution`, diff from `--repo`/`--base`.
    const resolved =
        resolve_task(cwd, task) !== null
            ? resolve_review_run({ workspaceDir: cwd, repoRoot, task, base })
            : resolve_review_run_by_spec({ workspaceDir: cwd, repoRoot, spec: task, base });
    if (isErr(resolved)) {
        return emit_error(resolved.error, json);
    }

    // `--write` (W4b): render a DRAFT packet from the same reconcile and write the one file. WITHOUT
    // `--write` the command falls through to M2's read-only stdout reconcile (unchanged).
    if (write) {
        // The `reviews/<slug>.md` stem: the canonical task-slug (id minus `TASK-`, lower-cased) — the
        // same normalizer the worktree branch tail + resolvers use, so the draft lands beside its run.
        const slug = task_slug(task);
        const drafted = draft_review_packet({ ...resolved.value, slug });
        if (isErr(drafted)) {
            return emit_error(drafted.error, json);
        }
        const path = join(cwd, 'reviews', `${slug}.md`);
        // No-clobber (AC-004): an existing packet is an error unless the operator passes `--force`,
        // and exactly this one file is written — the workspace/worktree is otherwise byte-unchanged.
        const writeResult = write_new_file(path, drafted.value.markdown, { overwrite: force });
        if (isErr(writeResult)) {
            return emit_error(writeResult.error, json);
        }
        return project({
            result: { ok: true, value: { level: 'clean' as const, path, status: 'draft' as const } },
            json,
            render: (value) => `wrote draft review packet: ${value.path}  (status: ${value.status})`,
        });
    }

    const reviewInput = resolved.value;
    return project({
        result: reconcile_review(reviewInput),
        json,
        render: (report) => {
            const notes: string[] = [];
            // R5-I06: name where the self-report packet was read from, so a worker who edited a different
            // copy (e.g. on `main` instead of in the worktree) sees why the reconcile looks the way it does.
            if (reviewInput.packetRef !== undefined) {
                notes.push(`reconciled the task packet from ${reviewInput.packetRef}`);
            }
            // R5-I04: an empty diff usually means the branch is already MERGED into the base (every claim
            // then reads claimed-not-changed), or nothing changed — point at the pre-merge review / a base.
            if (reviewInput.diffChangedFiles.length === 0) {
                const base = reviewInput.base ?? 'the base';
                notes.push(
                    `note: 0 changed files vs ${base} — if this branch is already merged into ${base} its diff is empty; ` +
                        `review the branch BEFORE merging, or pass \`--base <the branch's fork point>\`.`
                );
            }
            const prefix = notes.length > 0 ? `${notes.join('\n')}\n\n` : '';
            return prefix + format_review_report(report);
        },
    });
}
