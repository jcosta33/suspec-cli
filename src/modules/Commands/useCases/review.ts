#!/usr/bin/env node

// `swarm review <task>` — the reconcile engine's diff-touching command surface (M2,
// AC-017/024/026/027). Thin: resolve a finished run from a task id/slug (its worktree, its diff, its
// source spec, its task packet, its review packet if one exists), call the read-only engine, and
// project the reconcile facts to text / `--json` under the advisory exit posture (AC-024). It writes
// nothing (AC-025) and spawns no agent (AC-026); `--agent` is reserved for M3 and rejected here.
//   swarm review <task>     reconcile the finished run for <task>
//   swarm review            (TTY) enter the interactive flow (AC-027)
//   swarm review --json     machine output, never prompts

import { isErr } from '../../../infra/errors/result.ts';
import { project, emit_error, usage_error, resolve_review_run, reconcile_review } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_review_report, run_review_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive'],
        strings: ['--base'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const task = positional[0];

    // AC-026: `--agent` is reserved for M3 (agent-assisted evidence). M2 is the mechanical reconcile —
    // reject it rather than silently ignoring the flag, so it is not a recognized M2 invocation.
    if (argv.includes('--agent')) {
        return emit_error(usage_error('`swarm review --agent` is not available — M2 is the mechanical reconcile'), json);
    }

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || task === undefined) && process.stdout.isTTY === true && !json) {
        return run_review_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    if (task === undefined) {
        return emit_error(usage_error('usage: swarm review <task> [--base <branch>] [--json]'), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }

    const baseFlag = flags.get('base');
    if (typeof baseFlag === 'string' && baseFlag.startsWith('-')) {
        return emit_error(usage_error(`invalid --base value: "${baseFlag}" — expected a branch or commit`), json);
    }
    const base = typeof baseFlag === 'string' ? baseFlag : undefined;

    const resolved = resolve_review_run({ workspaceDir: cwd, repoRoot: rootResult.value, task, base });
    if (isErr(resolved)) {
        return emit_error(resolved.error, json);
    }

    return project({ result: reconcile_review(resolved.value), json, render: format_review_report });
}
