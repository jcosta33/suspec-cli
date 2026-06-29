// Resolve everything `suspec run` needs to launch a prepared task on an agent (SPEC-suspec-cli-run
// AC-005/006/008): the task's worktree + branch, the source it cites, and the resolved adapter from
// the code repo's `.suspec/config.yaml`. Read-only — it reads the workspace, git, and the config; it
// launches nothing and writes nothing (the command does that). Mirrors resolveReviewRun, stopping at
// the launch inputs (no diff, no reconcile).

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { err, ok, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { frontmatter_value, find_source_spec, resolve_task, resolve_worktree } from './taskLocator.ts';
import { task_slug } from '../services/worktreeNames.ts';
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
    // AC-008: the task must resolve to a packet in this workspace. Accept either the bare slug or the
    // canonical `TASK-<slug>` id `suspec status` reports — resolve_task tries both forms and returns the
    // frontmatter id, so `suspec run` finds the same packet new/show/review do (the canonical-key seam).
    const resolved = resolve_task(input.workspaceDir, input.task);
    if (resolved === null) {
        return err(
            createAppError(
                'NoWorkspace',
                `cannot run ${input.task}: no matching tasks/${input.task}.md or tasks/TASK-${input.task}.md in this workspace`,
                { capability: `running ${input.task}` }
            )
        );
    }
    const source = frontmatter_value(resolved.source, 'source');

    // AC-005: resolve the adapter from `.suspec/config.yaml` before touching git — an unknown agent, a
    // missing config, or an unreadable config is a usage error that launches nothing, and need not
    // depend on a worktree existing.
    const configPath = join(input.repoRoot, '.suspec', 'config.yaml');
    if (!existsSync(configPath)) {
        return err(
            usage_error(
                `no .suspec/config.yaml in ${input.repoRoot} — configure an agent adapter before \`suspec run\``
            )
        );
    }
    let configText: string;
    try {
        configText = readFileSync(configPath, 'utf8');
    } catch (caught: unknown) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        return err(usage_error(`cannot read .suspec/config.yaml: ${detail}`));
    }
    const adapter = resolve_adapter(parse_agent_config(configText), input.agent);
    if (isErr(adapter)) {
        return err(adapter.error);
    }

    // AC-006: the worktree must already exist — `suspec run` launches into it, it does not create one.
    // Note: unlike `suspec review`, `run` does NOT require the source spec to resolve — AC-008 requires
    // only the task packet. When the spec id is absent or unknown, resolution falls back to the lone
    // suspec worktree whose branch tail matches the task slug (taskLocator), so a prepared task still
    // launches; only the worktree is load-bearing here.
    const specSlug = source !== null ? (find_source_spec(input.workspaceDir, source)?.slug ?? '') : '';
    const worktree = resolve_worktree(input.repoRoot, specSlug, resolved.id);
    if (worktree === null) {
        // Name the exact per-task create command (SW-005): the branch tail derives from the task id, so
        // a bare `suspec worktree create` (no --task) makes the wrong branch. Use the spec slug when known.
        const tail = task_slug(resolved.id);
        const createCmd =
            specSlug !== ''
                ? `suspec worktree create ${specSlug} --task ${tail}`
                : `suspec worktree create <spec> --task ${tail}`;
        return err(
            usage_error(`no worktree for ${resolved.id} — create it with \`${createCmd}\` before launching the run`)
        );
    }

    return ok({
        task: resolved.id,
        worktreePath: worktree.path,
        branch: worktree.branch,
        source,
        adapter: adapter.value,
    });
}
