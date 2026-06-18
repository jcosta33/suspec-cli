// Resolve everything `swarm run` needs to launch a prepared task on an agent (SPEC-swarm-cli-run
// AC-005/006/008): the task's worktree + branch, the source it cites, and the resolved adapter from
// the code repo's `.swarm/config.yaml`. Read-only — it reads the workspace, git, and the config; it
// launches nothing and writes nothing (the command does that). Mirrors resolveReviewRun, stopping at
// the launch inputs (no diff, no reconcile).

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { err, ok, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { frontmatter_value, find_source_spec, resolve_worktree } from './taskLocator.ts';
import { parse_agent_config, resolve_adapter, type Adapter } from '../services/agentConfig.ts';
import { usage_error } from './unixOutcome.ts';

export type LaunchPlan = Readonly<{
    task: string;
    worktreePath: string;
    branch: string | null;
    source: string | null; // the task's `source:` (spec / change-plan id), recorded in the run record envelope
    adapter: Adapter;
}>;

export type ResolveLaunchInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    task: string;
    agent?: string; // explicit --agent <name>; else the config's agents.default
}>;

export function resolve_launch(input: ResolveLaunchInput): Result<LaunchPlan, AppError> {
    // AC-008: the task must resolve to a packet in this workspace.
    const taskPath = join(input.workspaceDir, 'tasks', `${input.task}.md`);
    if (!existsSync(taskPath)) {
        return err(
            createAppError('NoWorkspace', `cannot run ${input.task}: no tasks/${input.task}.md in this workspace`, {
                capability: `running ${input.task}`,
            })
        );
    }
    const source = frontmatter_value(readFileSync(taskPath, 'utf8'), 'source');

    // AC-005: resolve the adapter from `.swarm/config.yaml` before touching git — an unknown agent, a
    // missing config, or an unreadable config is a usage error that launches nothing, and need not
    // depend on a worktree existing.
    const configPath = join(input.repoRoot, '.swarm', 'config.yaml');
    if (!existsSync(configPath)) {
        return err(
            usage_error(`no .swarm/config.yaml in ${input.repoRoot} — configure an agent adapter before \`swarm run\``)
        );
    }
    let configText: string;
    try {
        configText = readFileSync(configPath, 'utf8');
    } catch (caught: unknown) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        return err(usage_error(`cannot read .swarm/config.yaml: ${detail}`));
    }
    const adapter = resolve_adapter(parse_agent_config(configText), input.agent);
    if (isErr(adapter)) {
        return err(adapter.error);
    }

    // AC-006: the worktree must already exist — `swarm run` launches into it, it does not create one.
    // Note: unlike `swarm review`, `run` does NOT require the source spec to resolve — AC-008 requires
    // only the task packet. When the spec id is absent or unknown, resolution falls back to the lone
    // swarm worktree whose branch tail matches the task slug (taskLocator), so a prepared task still
    // launches; only the worktree is load-bearing here.
    const specSlug = source !== null ? (find_source_spec(input.workspaceDir, source)?.slug ?? '') : '';
    const worktree = resolve_worktree(input.repoRoot, specSlug, input.task);
    if (worktree === null) {
        return err(
            usage_error(`no worktree for ${input.task} — run \`swarm worktree create\` before launching the run`)
        );
    }

    return ok({
        task: input.task,
        worktreePath: worktree.path,
        branch: worktree.branch,
        source,
        adapter: adapter.value,
    });
}
