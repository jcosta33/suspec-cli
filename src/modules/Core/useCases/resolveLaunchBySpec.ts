// Resolve everything `suspec work <SPEC>` needs to launch on a spec directly, with NO task
// (SPEC-suspec-cli-work AC-001/005/009). The task-less, spec-first sibling of resolve_launch: it
// resolves the spec by id-or-slug (mirroring resolve_review_run_by_spec) and the adapter from the code
// repo's `.suspec/config.yaml`, and returns the spec's id/slug/path for the worktree + prompt. Unlike
// resolve_launch it does NOT resolve an existing worktree — `suspec work` creates or reuses it. Read-only.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { err, ok, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { frontmatter_value, find_source_spec } from './taskLocator.ts';
import { parse_agent_config, resolve_adapter, type Adapter } from '../services/agentConfig.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { usage_error } from './unixOutcome.ts';

export type LaunchBySpecPlan = Readonly<{
    spec: string; // the canonical spec id (frontmatter `id`)
    specSlug: string; // the specs/<slug> dir — the worktree branch's spec segment (ADR-0046)
    specPath: string; // the spec.md path — the launch prompt's pointer (never inlined)
    // The driving spec id, recorded in the run envelope. Spec-first by design: unlike resolve_launch
    // (which derives `source` from a task packet's `source:` frontmatter), `suspec work` is anchored on
    // the spec, so this is always the resolved spec id — even when a `--task` narrows the run.
    source: string | null;
    adapter: Adapter;
}>;

export type ResolveLaunchBySpecInput = Readonly<{
    workspaceDir: string;
    repoRoot: string;
    spec: string; // a SPEC id or a spec dir slug
    agent?: string; // explicit --agent <name>; else the config's agents.default
}>;

// Resolve a spec by frontmatter id (preferred) or by dir slug (`specs/<slug>/spec.md`) — the same
// id-or-slug acceptance as resolve_review_run_by_spec. Returns the canonical id, the dir slug, the path,
// and the source; null when neither resolves.
function find_spec_by_ref(
    workspaceDir: string,
    ref: string
): { id: string; slug: string; path: string; source: string } | null {
    const byId = find_source_spec(workspaceDir, ref);
    if (byId !== null) {
        return { id: ref, slug: byId.slug, path: byId.path, source: readFileSync(byId.path, 'utf8') };
    }
    const bySlug = join(workspaceDir, 'specs', ref, 'spec.md');
    if (is_safe_segment(ref) && existsSync(bySlug)) {
        const source = readFileSync(bySlug, 'utf8');
        return { id: frontmatter_value(source, 'id') ?? ref, slug: ref, path: bySlug, source };
    }
    return null;
}

export function resolve_launch_by_spec(input: ResolveLaunchBySpecInput): Result<LaunchBySpecPlan, AppError> {
    // AC-001/009: the spec must resolve in this workspace. No task is required — a 1:1 run works the spec
    // directly (ADR-0134); a task, if any, is a caller-supplied narrowing, resolved by the command.
    const spec = find_spec_by_ref(input.workspaceDir, input.spec);
    if (spec === null) {
        return err(usage_error(`cannot work ${input.spec}: no spec with that id or slug in specs/`));
    }

    // AC-005/009: resolve the adapter from `.suspec/config.yaml` before any git — an unknown agent, a
    // missing config, or an unreadable config is a usage error that launches nothing (mirrors
    // resolve_launch; the worktree is created only after the adapter resolves).
    const configPath = join(input.repoRoot, '.suspec', 'config.yaml');
    if (!existsSync(configPath)) {
        return err(
            usage_error(
                `no .suspec/config.yaml in ${input.repoRoot} — configure an agent adapter before \`suspec work\``
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

    return ok({
        spec: spec.id,
        specSlug: spec.slug,
        specPath: spec.path,
        source: spec.id,
        adapter: adapter.value,
    });
}
