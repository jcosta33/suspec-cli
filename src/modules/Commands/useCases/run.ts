#!/usr/bin/env node

// `swarm run <task> --agent <name>` — the launch verb (SPEC-swarm-cli-run). Completes prepare → LAUNCH
// → reconcile: it launches an external coding agent on an already-prepared task, inside that task's
// worktree, and records the launch. Thin — resolve the launch inputs (task packet, worktree, adapter
// from `.swarm/config.yaml`), launch the agent, write the launch-envelope run record, and report the
// facts. It never *becomes* the agent (no model loop, no edits of its own), never writes the board or a
// review, and never renders a verdict (ADR-0077 reconcile-only; AC-002/003/007).
//   swarm run <task> --agent <name>   launch <name> on <task> in its worktree, record the launch
//   swarm run <task>                  use the config's agents.default
//   swarm run <task> --json           machine output (verdict-free)
//
// swarm run's OWN exit: 0 when it launched and recorded successfully and the agent exited 0; 1 (a
// warning) when the launch+record succeeded but the agent exited non-zero (a soft signal, not swarm's
// failure); 2 only for swarm's own errors (no task / outside a repo / unknown agent / no worktree /
// the program could not be launched). The agent's exit is a recorded FACT, not propagated verbatim.

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, usage_error, resolve_launch } from '../../Core/useCases/index.ts';
import {
    resolve_repo_root,
    current_branch,
    worktree_changed_files,
    launch_adapter,
    write_run_record,
    type RunRecord,
} from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json'],
        strings: ['--agent'],
    });
    const json = flags.get('json') === true;
    const task = positional[0];
    const agentFlag = flags.get('agent');
    const agent = typeof agentFlag === 'string' ? agentFlag : undefined;

    // AC-008: a missing task arg is a usage error (exit 2), writing nothing.
    if (task === undefined) {
        return emit_error(usage_error('usage: swarm run <task> [--agent <name>] [--json]'), json);
    }

    // AC-008: outside a git repository is a usage error (exit 2), launching nothing.
    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // AC-005/006/008: resolve the task packet, the adapter, and the worktree — any failure exits 2,
    // launching nothing and writing no run record.
    const plan = resolve_launch({ workspaceDir: cwd, repoRoot, task, agent });
    if (isErr(plan)) {
        return emit_error(plan.error, json);
    }
    const { adapter, worktreePath, branch, source } = plan.value;

    // AC-001/002: launch the agent in the task's worktree. swarm writes no code of its own; whatever
    // lands in the worktree is the agent's. A failure to launch the program is exit 2.
    const launched = launch_adapter(adapter.command, adapter.startup_instruction, worktreePath);
    if (isErr(launched)) {
        return emit_error(launched.error, json);
    }
    const { exit } = launched.value;

    // changed_files (ADR-0088 / D1): the worktree diff after the agent exits, reusing the review differ
    // (committed-since-base ∪ uncommitted) against the repo's current branch. Defensive — a run record
    // is never a gate, so a detached HEAD or a diff failure simply omits the field, never failing the run.
    const base = current_branch(repoRoot);
    const changed = base !== null ? worktree_changed_files(worktreePath, base) : null;
    const changed_files = changed !== null && !isErr(changed) ? changed.value : undefined;

    // AC-004: record the launch envelope under `.swarm/work/` (the code repo's gitignored scratch).
    const record: RunRecord = {
        task_id: task,
        adapter: adapter.name,
        worktree: worktreePath,
        branch,
        source,
        exit,
        changed_files,
        // The delegation-provenance block (ADR-0088 producer 1): a record of what was launched, never a
        // verdict. The launcher knows the worker, the task it was delegated, the worktree isolation, and
        // the exit; it does not restrict the agent's tools, so an interactive run could edit the worktree.
        provenance: {
            worker: adapter.name,
            reason: task,
            isolation: 'worktree',
            could_edit: true,
            exit,
        },
    };
    const written = write_run_record(repoRoot, record);

    // AC-007: report the launch facts (adapter, worktree, exit) + the next step. No verdict/result.
    const level = exit === 0 ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: { level, adapter: adapter.name, worktree: worktreePath, exit, record: written.path },
        },
        json,
        render: (value) =>
            `launched ${value.adapter} in ${value.worktree}  (agent exit ${value.exit})\n` +
            `  run record: ${value.record}\n` +
            `  next: swarm review ${task}`,
    });
}
