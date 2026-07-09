// Resolve everything `suspec work <SPEC>` needs to launch, from the STORE (SPEC-suspec-v2
// AC-004/AC-009). The v2 successor of resolve_launch_by_spec, re-rooted per ADR-0137: the spec
// resolves by id-or-slug against the store's flat `spec-*.md` files (never a repo `specs/` dir),
// and the runner resolves from the consumer-side `suspec.config.json` `runners` map + the
// built-ins — the retired `.suspec/config.yaml` `agents:` block is NOT read here. Read-only. A
// missing spec is a usage error (exit 2) NAMING the store path searched; an unknown runner is a
// usage error listing the known ones. The worktree is created by the command, not here.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { err, ok, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_runner_config, resolve_runner, type Runner } from '../../Workspace/useCases/index.ts';
import { find_store_spec } from './findStoreSpec.ts';
import { usage_error } from './unixOutcome.ts';

const CONFIG_FILENAME = 'suspec.config.json';

export type LaunchFromStorePlan = Readonly<{
    spec: string; // the canonical spec id (frontmatter `id`, else the slug)
    specSlug: string; // the filename tail (`spec-<slug>.md`) — the worktree branch segment (AC-004)
    specPath: string; // the ABSOLUTE store path — the launch prompt's pointer (AC-006)
    specSource: string; // the spec content — the staleness (AC-007) + runtime-needs (AC-005) scans read it
    runner: Runner;
}>;

export type ResolveLaunchFromStoreInput = Readonly<{
    repoRoot: string;
    storeDir: string;
    spec: string; // a spec id or a store slug
    runner?: string; // explicit --runner <name>; else runners.default, else the reference built-in
}>;

// The spec lookup itself lives in findStoreSpec.ts (shared with the `done` gate, which resolves
// the run's driving spec by its recorded id).

// The parsed consumer-side config, or null when absent/unreadable/malformed — the runner
// resolution then falls back to the built-ins (a config-less repo still launches).
function read_config(repoRoot: string): unknown {
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path)) {
        return null;
    }
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

export function resolve_launch_from_store(input: ResolveLaunchFromStoreInput): Result<LaunchFromStorePlan, AppError> {
    // AC-004: the spec must resolve in the STORE. Missing → exit 2, naming the path searched.
    const spec = find_store_spec(input.storeDir, input.spec);
    if (spec === null) {
        return err(
            usage_error(
                `cannot work ${input.spec}: no spec with that id or slug in ${input.storeDir} (searched spec-*.md)`
            )
        );
    }

    // AC-009: the runner resolves before any git — an unknown runner launches nothing (exit 2).
    const runner = resolve_runner(parse_runner_config(read_config(input.repoRoot)), input.runner);
    if (isErr(runner)) {
        return err(runner.error);
    }

    return ok({
        spec: spec.id,
        specSlug: spec.slug,
        specPath: spec.path,
        specSource: spec.source,
        runner: runner.value,
    });
}
