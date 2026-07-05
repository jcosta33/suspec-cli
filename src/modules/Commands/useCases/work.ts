#!/usr/bin/env node

// `suspec work <SPEC>` — the spec-first launch pipeline (SPEC-suspec-cli-work). One command from a spec
// to an agent working: resolve the spec + adapter (task OPTIONAL — a 1:1 run works the spec directly,
// ADR-0134), create or reuse the spec's worktree, run project-declared setup (advisory), generate a lean
// launch prompt, write it to gitignored scratch, launch the adapter in the worktree, and record the run.
// It never becomes the agent, authors no verdict, and writes no board or workspace artifact — its only
// writes are the run record + the transient prompt under `.suspec/work/` (ADR-0136 / ADR-0077 D8/D6).
//   suspec work <SPEC>                       launch agents.default on the spec, in a fresh/reused worktree
//   suspec work <SPEC> --agent <name>        pick the adapter
//   suspec work <SPEC> --task <t>            narrow to a task packet (its worktree tail + scope)
//   suspec work <SPEC> --dry-run             resolve + print the plan and prompt; launch/write nothing
//   suspec work <SPEC> --base <branch>       the worktree base (else the current branch)
//   suspec work <SPEC> --json                machine output (verdict-free)
//
// suspec work's OWN exit mirrors `run`: 0 launched-and-agent-exited-0; 1 launched but the agent exited
// non-zero (a soft signal); 2 only for suspec's own errors (no spec / outside a repo / unknown adapter /
// the program could not be launched). Setup failures are advisory warnings, never suspec's exit.

import { createHash } from 'node:crypto';

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    resolve_launch_by_spec,
    create_worktree,
    read_setup_commands,
    generate_prompt,
    derive_worktree_names,
    resolve_task,
    task_slug,
} from '../../Core/useCases/index.ts';
import {
    resolve_repo_root,
    current_branch,
    worktree_changed_files,
    is_worktree_dirty,
    run_setup,
    launch_adapter,
    write_prompt_scratch,
    write_run_record,
    type RunRecord,
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
        booleans: ['--json', '--dry-run'],
        strings: ['--agent', '--task', '--base'],
    });
    const json = flags.get('json') === true;
    const dryRun = flags.get('dry-run') === true;
    const spec = positional[0];
    const agentFlag = flags.get('agent');
    const agent = typeof agentFlag === 'string' ? agentFlag : undefined;
    const taskFlag = flags.get('task');
    const taskArg = typeof taskFlag === 'string' ? taskFlag : undefined;
    const baseFlag = flags.get('base');
    const base = typeof baseFlag === 'string' ? baseFlag : undefined;

    // AC-009: a missing spec arg is a usage error (exit 2), writing nothing.
    if (spec === undefined) {
        return emit_error(
            usage_error(
                'usage: suspec work <SPEC> [--agent <name>] [--task <t>] [--base <branch>] [--dry-run] [--json]\n' +
                    '  (by hand, needing no CLI: create the worktree, cd into it, and run your agent against the spec)'
            ),
            json
        );
    }

    // AC-009: outside a git repository is a usage error (exit 2), launching nothing.
    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // AC-001/005/009: resolve the spec + adapter (no worktree yet — work creates it). Any failure exits 2.
    const plan = resolve_launch_by_spec({ workspaceDir: cwd, repoRoot, spec, agent });
    if (isErr(plan)) {
        return emit_error(plan.error, json);
    }
    const { spec: specId, specSlug, specPath, source, adapter } = plan.value;

    // AC-001: an optional `--task` narrows to a task packet — its worktree tail (task_slug) and its path
    // (the prompt points at it). Absent, work runs the spec directly (the task is not a precondition).
    let taskId: string | undefined;
    let taskPath: string | undefined;
    if (taskArg !== undefined) {
        const resolved = resolve_task(cwd, taskArg);
        if (resolved === null) {
            return emit_error(usage_error(`cannot work --task ${taskArg}: no matching tasks/ packet`), json);
        }
        taskId = resolved.id;
        taskPath = resolved.path;
    }
    const taskSlug = taskId !== undefined ? task_slug(taskId) : undefined;

    // AC-004: the lean launch prompt — pure templating, computed once, written to scratch on launch.
    const prompt = generate_prompt({ specId, specPath, taskId, taskPath, adapterName: adapter.name });
    const baseBranch = base ?? current_branch(repoRoot) ?? 'main';

    // AC-008: --dry-run previews from pure computation and mutates nothing — no worktree, no setup, no
    // launch, no run record, no prompt scratch.
    if (dryRun) {
        const { branch, worktreePath } = derive_worktree_names({ repoRoot, specSlug, taskSlug });
        const setup = read_setup_commands(repoRoot);
        return project({
            result: {
                ok: true,
                value: {
                    level: 'clean' as const,
                    dry_run: true,
                    spec: specId,
                    adapter: adapter.name,
                    base: baseBranch,
                    branch,
                    worktree: worktreePath,
                    setup,
                    prompt,
                },
            },
            json,
            render: (v) =>
                `dry run — suspec work ${v.spec} (nothing launched, nothing written)\n` +
                `  adapter:  ${v.adapter}\n` +
                `  base:     ${v.base}\n` +
                `  branch:   ${v.branch}\n` +
                `  worktree: ${v.worktree}\n` +
                `  setup:    ${v.setup.length > 0 ? v.setup.join(' && ') : '(none)'}\n` +
                `  prompt:\n${indent(v.prompt)}`,
        });
    }

    // AC-002: create or reuse the spec's worktree (no agent; pure git). A failure exits 2.
    const created = create_worktree({ repoRoot, specSlug, taskSlug, baseBranch });
    if (isErr(created)) {
        return emit_error(created.error, json);
    }
    const worktreePath = created.value.worktreePath;
    const branch = created.value.branch;

    // Advisory notes routed to stderr (never the data stream): a dirty reused worktree, and setup outcomes.
    const notes: string[] = [];
    if (created.value.reused && is_worktree_dirty(worktreePath)) {
        notes.push(`note: reusing a worktree with uncommitted changes — ${worktreePath}`);
    }

    // AC-003: run project-declared setup in the worktree BEFORE launch. Advisory — a non-zero exit warns
    // and the launch still proceeds; no setup config is a no-op note.
    const setupCommands = read_setup_commands(repoRoot);
    if (setupCommands.length === 0) {
        notes.push('note: no setup commands in suspec.config.json — the agent sets up in-session');
    }
    for (const result of run_setup(setupCommands, worktreePath)) {
        if (result.exit !== 0) {
            notes.push(`warning: setup command failed (exit ${result.exit}) — ${result.command}`);
        }
    }

    // AC-004: write the transient prompt to scratch and record its provenance (path + sha256).
    const promptScratch = write_prompt_scratch(repoRoot, taskId ?? specId, prompt);
    const promptSha = createHash('sha256').update(prompt).digest('hex');

    // AC-002/005: launch the adapter in the worktree with the generated prompt. suspec writes no code of
    // its own; whatever lands in the worktree is the agent's. A failure to launch the program is exit 2.
    const launched = launch_adapter(adapter.command, prompt, worktreePath);
    if (isErr(launched)) {
        return emit_error(launched.error, json);
    }
    const { exit } = launched.value;

    // changed_files (ADR-0088): the worktree diff after the agent exits, against the repo's current
    // branch. Defensive — a run record is never a gate, so a diff failure simply omits the field.
    const diffBase = current_branch(repoRoot);
    const changed = diffBase !== null ? worktree_changed_files(worktreePath, diffBase) : null;
    const changed_files = changed !== null && !isErr(changed) ? changed.value : undefined;

    // AC-006: record the launch envelope, re-anchored on the driving artifact (the spec by default).
    const record: RunRecord = {
        task_id: taskId ?? specId,
        adapter: adapter.name,
        worktree: worktreePath,
        branch,
        source,
        exit,
        changed_files,
        driving_artifact: taskId !== undefined ? 'task' : 'spec',
        prompt: { path: promptScratch.path, sha256: promptSha },
        provenance: {
            worker: adapter.name,
            reason: taskId ?? specId,
            isolation: 'worktree',
            could_edit: true,
            exit,
        },
    };
    let written: { path: string } | null;
    try {
        written = write_run_record(repoRoot, record);
    } catch (caught: unknown) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        process.stderr.write(`suspec work: could not write the run record: ${detail}\n`);
        written = null;
    }

    // AC-007: report the launch facts (adapter, worktree, exit, records) + the next step. No verdict.
    const level = exit === 0 ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: {
                level,
                spec: specId,
                adapter: adapter.name,
                worktree: worktreePath,
                exit,
                record: written === null ? null : written.path,
                prompt: promptScratch.path,
            },
        },
        json,
        notes,
        render: (value) =>
            `launched ${value.adapter} on ${value.spec} in ${value.worktree}  (agent exit ${value.exit})\n` +
            `  run record: ${value.record ?? '(not written)'}\n` +
            `  prompt:     ${value.prompt}\n` +
            `  next: suspec review ${taskId ?? specId}`,
    });
}
