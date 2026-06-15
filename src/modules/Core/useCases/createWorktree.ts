// LaunchEngine.create (AC-009): create an isolated worktree on swarm/<spec-slug>[/<task-slug>] off
// the base branch. Idempotent-ish — if the branch already has a worktree, return it (reused) rather
// than failing or duplicating. No agent (AC-014): this is pure git orchestration.
//
// AC-010: after the worktree resolves, stamp a distinct port offset when the consumer-side
// swarm.config.json declares a runtime-isolation range — keyed on the branch, so two tasks of one
// spec get distinct ports. The config read and stamp writer are injectable so the wiring is testable
// without touching disk.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { find_worktree_for_branch, worktree_create } from '../../Workspace/useCases/index.ts';
import { parse_runtime_isolation_config, type RuntimeIsolationConfig } from '../services/runtimeIsolation.ts';
import { derive_worktree_names } from '../services/worktreeNames.ts';
import { stamp_runtime_isolation } from './stampRuntimeIsolation.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

const CONFIG_FILENAME = 'swarm.config.json';

// Default reader for the consumer-side swarm.config.json. Returns null — a no-op stamp — when the
// file is absent or unparseable; valid shapes are validated by the pure parser service.
function read_runtime_isolation_config(repoRoot: string): RuntimeIsolationConfig {
    const path = join(repoRoot, CONFIG_FILENAME);
    if (!existsSync(path)) {
        return null;
    }
    let raw: unknown;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
    return parse_runtime_isolation_config(raw);
}

export type CreateWorktreeInput = Readonly<{
    repoRoot: string;
    specSlug: string;
    taskSlug?: string;
    baseBranch: string;
    readConfig?: (repoRoot: string) => RuntimeIsolationConfig;
    writeStamp?: (path: string, content: string) => void;
}>;

export type CreateWorktreeReport = Readonly<{
    level: OutcomeLevel;
    branch: string;
    worktreePath: string;
    reused: boolean;
    port: number | null;
}>;

export function create_worktree(input: CreateWorktreeInput): Result<CreateWorktreeReport, AppError> {
    const { branch, worktreePath } = derive_worktree_names(input);

    const existing = find_worktree_for_branch(branch, input.repoRoot);
    let resolvedPath: string;
    let reused: boolean;
    if (existing !== null) {
        resolvedPath = existing;
        reused = true;
    } else {
        const created = worktree_create(worktreePath, branch, input.baseBranch, input.repoRoot);
        if (isErr(created)) {
            return err(created.error);
        }
        resolvedPath = created.value.path;
        reused = false;
    }

    // Stamp runtime isolation only when a config is set AND the worktree dir actually exists. A
    // reused-but-stale worktree (admin entry survived, the dir was removed) must not throw ENOENT into
    // an uncaught stack trace — return it without a port instead.
    const readConfig = input.readConfig ?? read_runtime_isolation_config;
    const config = readConfig(input.repoRoot);
    let port: number | null = null;
    if (config !== null && existsSync(resolvedPath)) {
        port = stamp_runtime_isolation({
            worktreePath: resolvedPath,
            slug: branch,
            config,
            writeFile: input.writeStamp,
        }).port;
    }

    return ok({ level: 'clean', branch, worktreePath: resolvedPath, reused, port });
}
