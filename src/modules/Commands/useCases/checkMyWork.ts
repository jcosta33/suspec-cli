#!/usr/bin/env node

// `suspec check-my-work "<intent>"` — the middle tier (SPEC-suspec-v2 AC-021/022): the gate + one
// adversarial reviewer, aimed at the CURRENT repo/worktree diff. No worktree is created and no
// store artifact is written unless `--save`. Two faces, in order:
//   1. the GATE: run the `verify` commands declared in suspec.config.json (each a bare
//      `binary arg arg`, no shell, captured like `evidence add`); the overall gate exit is the
//      FIRST non-zero command exit; no `verify` declared → a note, and the gate is skipped.
//   2. the REVIEW: render the single-reviewer prompt (the one-line intent + the diff summary
//      against the merge-base with the default branch — or the staged+unstaged set when already
//      on it) and dispatch it to the default runner IN THE CURRENT DIR (never a worktree).
// A diff touching a `risk_paths` glob prints the one advisory nudge line (AC-022, never blocking).
//   suspec check-my-work "<intent>"              gate + reviewer on the current diff
//   suspec check-my-work "<intent>" --save       also record a check run + evidence in the store
//   suspec check-my-work "<intent>" --no-review  gate only (no dispatch)
//   suspec check-my-work "<intent>" --dry-run    print the plan + reviewer prompt; run nothing
//   suspec check-my-work "<intent>" --runner <name> · --json
//
// Exits MIRROR THE GATE: 0 every verify command passed (or none declared) · 1 a verify command
// failed (the reviewer's exit is reported as a note, never the code) · 2 usage / no git repo /
// a verify command that cannot execute at all / the reviewer program could not launch.

import { join } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    resolve_store_dir,
    write_store_artifact,
    read_run_state,
    run_filename,
    read_verify_commands,
    risk_path_nudge,
    resolve_runner_from_config,
    generate_review_prompt,
    build_check_run_content,
    finish_run_content,
    add_evidence,
} from '../../Core/useCases/index.ts';
import {
    resolve_repo_root,
    current_branch,
    default_branch,
    head_sha,
    worktree_changed_files,
    worktree_diff_digest,
    capture_command,
    launch_runner,
    render_runner_command,
} from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

const USAGE =
    'usage: suspec check-my-work "<one-line intent>" [--save] [--no-review] [--dry-run] [--runner <name>] [--json]';

// The saved check run's slug: `check-<squeezed-intent>` — deterministic, so re-checking the same
// intent updates the same run file instead of littering the store.
function check_slug(intent: string): string {
    const squeezed = intent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
        .replace(/-+$/, '');
    return `check-${squeezed.length > 0 ? squeezed : 'work'}`;
}

function indent(text: string): string {
    return text
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n');
}

type GateRow = Readonly<{ command: string; exit: number }>;

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--save', '--no-review', '--dry-run'],
        strings: ['--runner'],
    });
    const json = flags.get('json') === true;
    const save = flags.get('save') === true;
    const noReview = flags.get('no-review') === true;
    const dryRun = flags.get('dry-run') === true;
    const runnerFlag = flags.get('runner');
    const runnerName = typeof runnerFlag === 'string' ? runnerFlag : undefined;
    const intentRaw = positional[0];

    // The intent is the reviewer's anchor — a missing/empty one is a usage error (exit 2).
    const intent = intentRaw?.trim().replace(/\s+/g, ' ') ?? '';
    if (intent.length === 0) {
        return emit_error(
            usage_error(`${USAGE}\n  the intent is what the reviewer reviews against — say it in one line`),
            json
        );
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // The diff base (AC-021): the default branch (worktree_changed_files diffs against the
    // merge-base, three-dot) — or, when already ON the default branch, HEAD, which reduces the
    // committed side to nothing and leaves exactly the staged+unstaged+untracked set.
    const branch = current_branch(repoRoot);
    const defaultBase = default_branch(repoRoot);
    const baseRef = branch !== null && branch === defaultBase ? 'HEAD' : defaultBase;
    const changed = worktree_changed_files(repoRoot, baseRef);
    if (isErr(changed)) {
        return emit_error(changed.error, json);
    }
    const changedFiles = changed.value;

    // AC-022: the risk-path nudge — one advisory stderr line when the diff touches a declared
    // risk_paths glob; silence otherwise. Never blocking.
    const notes: string[] = [];
    const nudge = risk_path_nudge(repoRoot, changedFiles);
    if (nudge !== null) {
        notes.push(nudge);
    }

    const verifyCommands = read_verify_commands(repoRoot);
    if (verifyCommands.length === 0) {
        notes.push('note: no `verify` commands declared in suspec.config.json — gate skipped');
    }
    const prompt = generate_review_prompt({ intent, baseRef, changedFiles });

    // --dry-run previews from pure computation: no command runs, nothing is written or dispatched.
    if (dryRun) {
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    dry_run: true,
                    intent,
                    base: baseRef,
                    changed_files: changedFiles,
                    verify: verifyCommands,
                    prompt,
                },
            },
            json,
            notes,
            render: (v) =>
                `dry run — suspec check-my-work (nothing run, nothing written, nothing dispatched)\n` +
                `  intent:  ${v.intent}\n` +
                `  base:    ${v.base}\n` +
                `  files:   ${v.changed_files.length > 0 ? v.changed_files.join(', ') : '(no changes)'}\n` +
                `  verify:  ${v.verify.length > 0 ? v.verify.join(' && ') : '(none declared)'}\n` +
                `  prompt:\n${indent(v.prompt)}`,
        });
    }

    // --save: the ONLY path that touches the store (AC-021). The check run file goes in first so
    // the evidence engine has a run to hang records on; the gate captures then flow through
    // add_evidence — the records are byte-identical to `suspec evidence add`'s, mapped to the
    // pseudo-criterion VERIFY (a check run gates the intent, not a spec AC).
    let storeDir: string | null = null;
    let runPath: string | null = null;
    let runSlug: string | null = null;
    if (save) {
        const store = resolve_store_dir({ repoRoot });
        if (isErr(store)) {
            return emit_error(store.error, json);
        }
        storeDir = store.value.storeDir;
        runSlug = check_slug(intent);
        runPath = join(storeDir, run_filename(runSlug));
        // A re-check of the same intent REPLACES the previous check record (the CLI owns a check
        // run's whole file — no agent appends to it); the evidence dir keeps accumulating.
        const written = write_store_artifact(
            runPath,
            build_check_run_content({
                intent,
                worktree: repoRoot,
                branch,
                baseSha: head_sha(repoRoot),
                pid: process.pid,
                heartbeat: new Date().toISOString(),
            })
        );
        if (isErr(written)) {
            return emit_error(written.error, json);
        }
    }

    // 1. The GATE: each declared verify command runs in the repo root — a bare binary + args, no
    // shell (the run_setup/evidence-add surface). A command that cannot execute at all is exit 2;
    // a non-zero exit is the gate's own signal (first one wins).
    const gateRows: GateRow[] = [];
    let gateExit = 0;
    for (const command of verifyCommands) {
        const commandArgv = command.trim().split(/\s+/);
        let exit: number;
        if (storeDir !== null && runSlug !== null) {
            const recorded = add_evidence({
                storeDir,
                runSlug,
                ac: 'VERIFY',
                command: commandArgv,
                capture: capture_command,
                diffDigest: worktree_diff_digest,
            });
            if (isErr(recorded)) {
                return emit_error(recorded.error, json);
            }
            exit = recorded.value.exit;
        } else {
            const captured = capture_command(commandArgv, repoRoot);
            if (isErr(captured)) {
                return emit_error(captured.error, json);
            }
            exit = captured.value.exit;
        }
        gateRows.push({ command, exit });
        if (exit !== 0 && gateExit === 0) {
            gateExit = exit;
        }
    }

    // Release the saved run's lock fields: the gate is synchronous, so the record finishes here.
    if (runPath !== null) {
        const state = read_run_state(runPath);
        /* v8 ignore next 6 -- the run file was written above in the same process; vanishing needs an outside actor mid-command */
        if (state !== null) {
            const finished = write_store_artifact(runPath, finish_run_content(state.content, gateExit));
            if (isErr(finished)) {
                notes.push(`warning: could not record the gate exit in ${runPath}`);
            }
        }
    }

    // 2. The REVIEW: dispatch the single-reviewer prompt to the runner in the CURRENT dir (never
    // a worktree). Skipped by --no-review, and on an empty diff (nothing to review).
    let reviewed = false;
    let reviewerExit: number | null = null;
    let reviewerName: string | null = null;
    if (!noReview && changedFiles.length === 0) {
        notes.push('note: no changes against the base — nothing to review; reviewer not dispatched');
    } else if (!noReview) {
        const runner = resolve_runner_from_config(repoRoot, runnerName);
        if (isErr(runner)) {
            return emit_error(runner.error, json);
        }
        // {store} in a template renders to the repo's store when one exists (probe — a plain
        // check must not create it); a store-less repo falls back to the repo root.
        const probed =
            storeDir ??
            (() => {
                const probe = resolve_store_dir({ repoRoot, probe: true });
                return isErr(probe) ? repoRoot : probe.value.storeDir;
            })();
        const rendered = render_runner_command(runner.value.command_template, {
            prompt,
            cwd: repoRoot,
            store: probed,
        });
        const launched = launch_runner(rendered, repoRoot);
        if (isErr(launched)) {
            return emit_error(launched.error, json);
        }
        reviewed = true;
        reviewerExit = launched.value.exit;
        reviewerName = runner.value.name;
        notes.push(`note: reviewer (${reviewerName}) exited ${reviewerExit} — the command's exit mirrors the gate`);
    }

    // The exit MIRRORS THE GATE (AC-021): clean when every verify command passed, warning (1)
    // when one failed — the reviewer's exit is a note above, never the code.
    const level = gateExit === 0 ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: {
                level,
                intent,
                base: baseRef,
                changed_files: changedFiles,
                gate: gateRows,
                gate_exit: gateExit,
                reviewed,
                reviewer: reviewerName,
                reviewer_exit: reviewerExit,
                saved: runPath !== null ? { run_file: runPath } : null,
            },
        },
        json,
        notes,
        render: (v) =>
            [
                `check-my-work — ${v.intent}`,
                `  diff:     ${v.changed_files.length} file(s) against ${v.base}`,
                ...(v.gate.length > 0
                    ? v.gate.map((row) => `  verify:   ${row.command}  (exit ${row.exit})`)
                    : ['  verify:   (none declared — skipped)']),
                `  gate:     ${v.gate_exit === 0 ? 'passed' : `blocked (exit ${v.gate_exit})`}`,
                // reviewer/reviewer_exit are set exactly when reviewed — String() avoids a dead ?? branch
                `  review:   ${v.reviewed ? `dispatched to ${String(v.reviewer)} (exited ${String(v.reviewer_exit)})` : 'not dispatched'}`,
                ...(v.saved !== null ? [`  saved:    ${v.saved.run_file}`] : []),
            ].join('\n'),
    });
}
