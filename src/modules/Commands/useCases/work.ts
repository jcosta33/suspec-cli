#!/usr/bin/env node

// `suspec work <SPEC>` — the spec-first launch pipeline, re-rooted onto the STORE (SPEC-suspec-v2
// AC-004..009; ADR-0137). One command from a store spec to an agent working: resolve the spec from
// the store's flat `spec-*.md` files and the runner from suspec.config.json `runners` (the retired
// `.suspec/config.yaml` agents block is no longer read), refuse a stale spec (recorded base_sha vs
// affected_areas — `--anyway` overrides), refuse a live run (run-file lock + heartbeat — `--attach`
// prints the runner's native hint, `--second-worktree` launches beside it), create or reuse the
// `suspec/<spec-slug>` worktree under .worktrees/, run the env-complete setup (BLOCKING when the
// spec's Verify clauses name runtime commands, advisory otherwise), write the run file into the
// store (grammar-stamped, `status: live`, pid + heartbeat), and launch the runner in the worktree
// with a prompt that POINTS at the store spec + run file by absolute path — no spec body copied,
// no other artifact referenced. It never becomes the agent and writes nothing in the repo beyond
// the worktree: the store run file IS the record (ADR-0136 / ADR-0137 D1/D2/D4).
//   suspec work <SPEC>                       launch the default runner on the store spec
//   suspec work <SPEC> --runner <name>       pick the runner (built-ins: claude, codex)
//   suspec work <SPEC> --anyway              launch despite recorded spec staleness / the wip cap
//   suspec work <SPEC> --attach              a live run: print the runner's native attach hint
//   suspec work <SPEC> --second-worktree     a live run: launch in a suffixed worktree + run file
//   suspec work <SPEC> --base <branch>       the worktree base (else the current branch)
//   suspec work <SPEC> --dry-run             resolve + print the plan and prompt; launch nothing
//   suspec work <SPEC> --json                machine output (verdict-free)
//
// Exits: 0 launched and the agent exited 0; 1 launched but the agent exited non-zero (a soft
// signal) OR blocked by a gate (staleness / live-run lock / a setup failure the spec's ACs make
// blocking); 2 usage / spec missing from the store / unknown runner / the program could not launch.

import { join } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    generate_prompt,
    derive_worktree_names,
    create_worktree,
    resolve_store_dir,
    write_store_artifact,
    resolve_launch_from_store,
    resolve_setup_plan,
    check_store_spec_staleness,
    store_decay_note,
    read_store_settings,
    list_active_specs,
    read_run_state,
    spec_requires_runtime,
    build_run_content,
    reclaim_run_content,
    finish_run_content,
    abort_run_content,
    is_heartbeat_fresh,
    run_filename,
} from '../../Core/useCases/index.ts';
import {
    resolve_repo_root,
    current_branch,
    head_sha,
    is_worktree_dirty,
    run_setup,
    launch_runner,
    copy_setup_files,
    render_runner_command,
    runner_attach_hint,
} from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

function indent(text: string): string {
    return text
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
}

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--dry-run', '--anyway', '--attach', '--second-worktree'],
        // --agent / --task are the RETIRED v1 surfaces, declared only to fail loudly below.
        strings: ['--runner', '--base', '--agent', '--task'],
    });
    const json = flags.get('json') === true;
    const dryRun = flags.get('dry-run') === true;
    const anyway = flags.get('anyway') === true;
    const attach = flags.get('attach') === true;
    const secondWorktree = flags.get('second-worktree') === true;
    const spec = positional[0];
    const runnerFlag = flags.get('runner');
    const runnerName = typeof runnerFlag === 'string' ? runnerFlag : undefined;
    const baseFlag = flags.get('base');
    const base = typeof baseFlag === 'string' ? baseFlag : undefined;

    // A missing spec arg is a usage error (exit 2), writing nothing.
    if (spec === undefined) {
        return emit_error(
            usage_error(
                'usage: suspec work <SPEC> [--runner <name>] [--base <branch>] [--anyway] [--attach] [--second-worktree] [--dry-run] [--json]\n' +
                    '  (by hand, needing no CLI: create the worktree, cd into it, and run your agent against the store spec)'
            ),
            json
        );
    }

    // The retired v1 flags fail loudly, never silently (ADR-0137: config.yaml agents and workspace
    // task packets are gone from this surface).
    if (flags.get('agent') !== undefined) {
        return emit_error(
            usage_error(
                '--agent is retired — runners now come from suspec.config.json `runners`; pass --runner <name>'
            ),
            json
        );
    }
    if (flags.get('task') !== undefined) {
        return emit_error(
            usage_error('--task is retired — the store holds no task packets; `suspec work` works the spec directly'),
            json
        );
    }

    // A flag-shaped --base would be passed to git as an option (`git worktree add … -x`) — reject it
    // before it reaches git, mirroring the `suspec worktree`/`review` option-injection guard.
    if (base?.startsWith('-') === true) {
        return emit_error(usage_error(`invalid --base value: "${base}" — expected a branch or commit`), json);
    }

    // Outside a git repository is a usage error (exit 2), launching nothing.
    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // AC-001: the repo's store dir (created on first resolution — that is store resolution's own
    // contract, not a launch side effect).
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }
    const storeDir = store.value.storeDir;

    // AC-004/009: resolve the spec FROM THE STORE + the runner from suspec.config.json. A missing
    // spec (naming the store path searched) or an unknown runner (listing the known) exits 2.
    const plan = resolve_launch_from_store({ repoRoot, storeDir, spec, runner: runnerName });
    if (isErr(plan)) {
        return emit_error(plan.error, json);
    }
    const { spec: specId, specSlug, specPath, specSource, runner } = plan.value;

    // AC-019: the ambient decay line — one stderr note when the store holds decayed items; the
    // shared hook (`store_decay_note`) is the same one `status` (and Wave 5's `next`) print.
    const notes: string[] = [];
    const decayNote = store_decay_note(repoRoot);
    if (decayNote !== null) {
        notes.push(decayNote);
    }

    // AC-007: staleness at launch — the spec's recorded base_sha/affected_areas vs the repo's
    // current state. Stale refuses (exit 1) printing the drifted files, unless --anyway.
    const staleness = check_store_spec_staleness({ repoRoot, specSource });
    if (staleness.stale && !anyway) {
        return project({
            result: {
                ok: true,
                value: {
                    level: 'warning' as const,
                    refused: 'stale-spec' as const,
                    spec: specId,
                    base_sha: staleness.baseSha,
                    drifted_files: staleness.driftedFiles,
                },
            },
            json,
            notes,
            render: (v) =>
                [
                    `refusing to launch: ${v.spec} is stale — files under its affected areas drifted since base_sha ${v.base_sha ?? 'unknown'}`,
                    ...v.drifted_files.map((file) => `  drifted: ${file}`),
                    '  relaunch with --anyway to override',
                ].join('\n'),
        });
    }
    if (staleness.stale && anyway) {
        notes.push(
            `note: launching anyway — ${staleness.driftedFiles.length} file(s) drifted under the spec's affected areas since ${staleness.baseSha ?? 'unknown'}`
        );
    }

    // AC-019: the WIP cap — a real launch refuses when the OTHER active (status ready/live) store
    // specs already fill `wip_cap` (suspec.config.json, default 3). Relaunching one of the active
    // specs occupies no new slot; --anyway overrides; --dry-run launches nothing, so it passes.
    if (!dryRun && !anyway) {
        const wipCap = read_store_settings(repoRoot).wipCap;
        const otherActive = list_active_specs(storeDir).filter((active) => active.slug !== specSlug);
        if (otherActive.length >= wipCap) {
            return project({
                result: {
                    ok: true,
                    value: {
                        level: 'warning' as const,
                        refused: 'wip-cap' as const,
                        spec: specId,
                        wip_cap: wipCap,
                        active: otherActive.map((active) => active.id),
                    },
                },
                json,
                notes,
                render: (v) =>
                    [
                        `refusing to launch: ${v.active.length} active spec(s) already fill the wip cap (${v.wip_cap})`,
                        ...v.active.map((id) => `  active: ${id}`),
                        '  finish or archive one (suspec store doctor), raise wip_cap in suspec.config.json, or relaunch with --anyway',
                    ].join('\n'),
            });
        }
    }

    // AC-008: the run lock. The spec's primary run file carries status + pid + heartbeat; a FRESH
    // heartbeat means a live run — refuse, offering --attach (dispatching nothing) and
    // --second-worktree. A dead heartbeat is reported reclaimable and the relaunch takes the lock.
    let runSlug = specSlug;
    const primaryRunPath = join(storeDir, run_filename(specSlug));
    const primaryRun = read_run_state(primaryRunPath);
    const live =
        primaryRun !== null &&
        primaryRun.lock.status === 'live' &&
        is_heartbeat_fresh(primaryRun.lock.heartbeat, Date.now());
    if (attach) {
        if (!live) {
            return emit_error(
                usage_error(`no live run for ${specId} — nothing to attach; launch with \`suspec work ${spec}\``),
                json
            );
        }
        // Dispatch NOTHING: print the runner's native attach hint and stop (ADR-0136 D6).
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    spec: specId,
                    run_file: primaryRunPath,
                    pid: primaryRun.lock.pid,
                    attach_hint: runner_attach_hint(runner.name, primaryRun.lock.worktree ?? ''),
                },
            },
            json,
            render: (v) =>
                `live run on ${v.spec} (pid ${v.pid ?? 'unknown'}) — attach with the runner's own session command:\n  ${v.attach_hint}`,
        });
    }
    if (live && secondWorktree) {
        // A suffixed sibling: the first `<slug>-N` whose run file is absent or not live.
        let n = 2;
        for (;;) {
            const candidate = read_run_state(join(storeDir, run_filename(`${specSlug}-${n}`)));
            if (candidate?.lock.status !== 'live' || !is_heartbeat_fresh(candidate.lock.heartbeat, Date.now())) {
                break;
            }
            n += 1;
        }
        runSlug = `${specSlug}-${n}`;
    } else if (live) {
        return project({
            result: {
                ok: true,
                value: {
                    level: 'warning' as const,
                    refused: 'active-run' as const,
                    spec: specId,
                    run_file: primaryRunPath,
                    pid: primaryRun.lock.pid,
                    heartbeat: primaryRun.lock.heartbeat,
                    attach_hint: runner_attach_hint(runner.name, primaryRun.lock.worktree ?? ''),
                },
            },
            json,
            render: (v) =>
                `refusing to launch: a live run already holds ${v.spec} (${v.run_file}, pid ${v.pid ?? 'unknown'}, heartbeat ${v.heartbeat ?? 'none'})\n` +
                `  attach to it:      suspec work ${spec} --attach   (${v.attach_hint})\n` +
                `  work beside it:    suspec work ${spec} --second-worktree`,
        });
    } else if (primaryRun !== null && primaryRun.lock.status === 'live') {
        notes.push(
            `note: ${run_filename(specSlug)} holds a stale lock (pid ${primaryRun.lock.pid ?? 'unknown'}, heartbeat ${
                primaryRun.lock.heartbeat ?? 'none'
            }) — the run is reclaimable; relaunching`
        );
    }
    const runPath = join(storeDir, run_filename(runSlug));

    // AC-006: the prompt is a pointer into the store — the spec + run file by ABSOLUTE path.
    const prompt = generate_prompt({ specId, specPath, runPath });
    const baseBranch = base ?? current_branch(repoRoot) ?? 'main';

    // --dry-run previews from pure computation and mutates nothing in the repo or the store — no
    // worktree, no setup, no run file, no launch.
    if (dryRun) {
        const { branch, worktreePath } = derive_worktree_names({ repoRoot, specSlug: runSlug });
        const setup = resolve_setup_plan({ repoRoot });
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    dry_run: true,
                    spec: specId,
                    spec_path: specPath,
                    runner: runner.name,
                    base: baseBranch,
                    branch,
                    worktree: worktreePath,
                    run_file: runPath,
                    setup: setup.commands,
                    setup_source: setup.source,
                    setup_copy: setup.copies,
                    prompt,
                },
            },
            json,
            notes,
            render: (v) =>
                `dry run — suspec work ${v.spec} (nothing launched, nothing written)\n` +
                `  spec:     ${v.spec_path}\n` +
                `  runner:   ${v.runner}\n` +
                `  base:     ${v.base}\n` +
                `  branch:   ${v.branch}\n` +
                `  worktree: ${v.worktree}\n` +
                `  run file: ${v.run_file}\n` +
                `  setup:    ${v.setup.length > 0 ? `${v.setup.join(' && ')} (${v.setup_source})` : '(none)'}\n` +
                `  copy:     ${v.setup_copy.length > 0 ? v.setup_copy.join(', ') : '(none)'}\n` +
                `  prompt:\n${indent(v.prompt)}`,
        });
    }

    // AC-004: create or reuse the spec's worktree — `suspec/<spec-slug>` under .worktrees/, exactly
    // as before (derive_worktree_names). A failure exits 2.
    const created = create_worktree({ repoRoot, specSlug: runSlug, baseBranch });
    if (isErr(created)) {
        return emit_error(created.error, json);
    }
    const worktreePath = created.value.worktreePath;
    const branch = created.value.branch;
    if (created.value.reused && is_worktree_dirty(worktreePath)) {
        notes.push(`note: reusing a worktree with uncommitted changes — ${worktreePath}`);
    }

    // AC-005: env-complete setup — declared commands, else the lockfile autodetect, plus the
    // setup_copy allowlist. A failure BLOCKS the launch (exit 1, nothing launched) when the spec's
    // Verify clauses name runtime commands; otherwise it stays the advisory warning.
    const setupPlan = resolve_setup_plan({ repoRoot });
    if (setupPlan.commands.length === 0 && setupPlan.copies.length === 0) {
        notes.push('note: no setup declared or detected — the agent sets up in-session');
    }
    const setupFailures: string[] = [];
    for (const result of run_setup(setupPlan.commands, worktreePath)) {
        if (result.exit !== 0) {
            const hint =
                result.exit === 127
                    ? ' — the program is not on PATH, or the command uses shell syntax (setup runs a bare `binary arg arg`, no shell)'
                    : '';
            setupFailures.push(`setup command failed (exit ${result.exit}) — ${result.command}${hint}`);
        }
    }
    for (const copied of copy_setup_files(repoRoot, worktreePath, setupPlan.copies)) {
        if (!copied.ok) {
            setupFailures.push(`setup_copy failed — ${copied.path}: ${copied.reason ?? 'unknown reason'}`);
        }
    }
    if (setupFailures.length > 0) {
        if (spec_requires_runtime(specSource)) {
            return project({
                result: {
                    ok: true,
                    value: {
                        level: 'warning' as const,
                        refused: 'setup-failed' as const,
                        spec: specId,
                        failures: setupFailures,
                    },
                },
                json,
                notes,
                render: (v) =>
                    [
                        `refusing to launch: setup failed and the spec's ACs verify with runtime commands (${v.spec})`,
                        ...v.failures.map((failure) => `  ${failure}`),
                    ].join('\n'),
            });
        }
        for (const failure of setupFailures) {
            notes.push(`warning: ${failure}`);
        }
    }

    // AC-006/008: the run file, created in the store AT launch — the record + lock. A fresh file
    // gets the full grammar-stamped record; an existing one (a reclaim, or a re-run after exit) is
    // re-stamped in frontmatter only, preserving whatever the agent appended to the body.
    const fields = {
        specId,
        worktree: worktreePath,
        branch,
        baseSha: head_sha(repoRoot),
        pid: process.pid,
        heartbeat: new Date().toISOString(),
    };
    const existingRun = read_run_state(runPath);
    const runContent =
        existingRun !== null ? reclaim_run_content(existingRun.content, fields) : build_run_content(fields);
    const runWritten = write_store_artifact(runPath, runContent);
    if (isErr(runWritten)) {
        return emit_error(runWritten.error, json);
    }

    // AC-009: render the runner's command template ({prompt}/{cwd}/{store} substituted post-split)
    // and launch it in the worktree with launch_runner's no-shell spawn. A program that cannot be
    // launched is suspec's own failure (exit 2) — and the lock is released so the dead attempt
    // never blocks the next `work`.
    const argvRendered = render_runner_command(runner.command_template, {
        prompt,
        cwd: worktreePath,
        store: storeDir,
    });
    const launched = launch_runner(argvRendered, worktreePath);
    if (isErr(launched)) {
        const aborted = write_store_artifact(runPath, abort_run_content(runContent));
        /* v8 ignore next 3 -- the run write above just succeeded on the same dir, so a failing abort write needs the store to vanish between the two calls with no agent in between */
        if (isErr(aborted)) {
            process.stderr.write(`suspec work: could not release the run lock at ${runPath}\n`);
        }
        return emit_error(launched.error, json);
    }
    const { exit } = launched.value;

    // Release the lock: re-read the run file (the agent may have appended to it) and record the
    // exit as a fact. A failure here degrades to a warning — the launch already happened.
    const afterRun = read_run_state(runPath);
    if (afterRun !== null) {
        const finished = write_store_artifact(runPath, finish_run_content(afterRun.content, exit));
        if (isErr(finished)) {
            notes.push(`warning: could not record the runner exit in ${runPath}`);
        }
    } else {
        notes.push(`warning: the run file at ${runPath} disappeared during the run — no exit recorded`);
    }

    // Report the launch facts. No verdict — the agent's exit is data (0 → clean, else warning).
    const level = exit === 0 ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: {
                level,
                spec: specId,
                spec_path: specPath,
                runner: runner.name,
                worktree: worktreePath,
                branch,
                reused: created.value.reused,
                exit,
                run_file: runPath,
            },
        },
        json,
        notes,
        render: (value) =>
            `launched ${value.runner} on ${value.spec} in ${value.worktree}${value.reused ? ' (reused worktree)' : ''}  (agent exit ${value.exit})\n` +
            `  run file: ${value.run_file}\n` +
            `  spec:     ${value.spec_path}`,
    });
}
