// Resolve everything `suspec work <SPEC>` needs to launch, from the STORE (SPEC-suspec-v2
// AC-004/AC-009). The v2 successor of resolve_launch_by_spec, re-rooted per ADR-0137: the spec
// resolves by id-or-slug against the store's flat `spec-*.md` files (never a repo `specs/` dir),
// and the runner resolves from the consumer-side `suspec.config.json` `runners` map + the
// built-ins — the retired `.suspec/config.yaml` `agents:` block is NOT read here. Read-only. A
// missing spec is a usage error (exit 2) NAMING the store path searched; an unknown runner is a
// usage error listing the known ones. The worktree is created by the command, not here.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { err, ok, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_runner_config, resolve_runner, type Runner } from '../../Workspace/useCases/index.ts';
import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { usage_error } from './unixOutcome.ts';

const CONFIG_FILENAME = 'suspec.config.json';
const SPEC_FILE = /^spec-(.+)\.md$/;

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

type FoundSpec = Readonly<{ id: string; slug: string; path: string; source: string }>;

// Scan the store's flat spec-*.md files for the ref: a frontmatter-id match wins; a slug
// (filename-tail) match is the fallback. The scan never joins the raw ref into a path — it only
// compares against names readdir returned — so a traversal-shaped ref can never escape the store.
function find_store_spec(storeDir: string, ref: string): FoundSpec | null {
    if (!existsSync(storeDir)) {
        return null;
    }
    let names: string[];
    try {
        names = readdirSync(storeDir).sort();
    } catch {
        return null;
    }
    let bySlug: FoundSpec | null = null;
    for (const name of names) {
        const match = SPEC_FILE.exec(name);
        if (match === null) {
            continue;
        }
        const path = join(storeDir, name);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
        } catch {
            continue; // a dir masquerading as spec-*.md — not an artifact, skip
        }
        const slug = match[1];
        const id = fm_scalar(read_frontmatter(source).id) ?? slug;
        if (id === ref) {
            return { id, slug, path, source };
        }
        if (slug === ref && bySlug === null) {
            bySlug = { id, slug, path, source };
        }
    }
    return bySlug;
}

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
