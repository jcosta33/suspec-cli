// Resolve a runner from the consumer-side suspec.config.json ALONE (SPEC-suspec-v2 AC-021/023) —
// the spec-less sibling of resolve_launch_from_store, for the surfaces that dispatch a prompt
// without a store spec to resolve first (`check-my-work`'s reviewer, `write spec --launch`'s
// spec author). Same resolution contract as `work` (AC-009): the explicit name, else
// `runners.default`, else the reference built-in; an unknown name is a usage error listing the
// known ones. The runner adapters stay a Workspace leaf (they name runner CLIs) — this reads the
// config and delegates through the Workspace barrel, exactly like resolve_launch_from_store.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_runner_config, resolve_runner, type Runner } from '../../Workspace/useCases/index.ts';

const CONFIG_FILENAME = 'suspec.config.json';

export function resolve_runner_from_config(repoRoot: string, requested?: string): Result<Runner, AppError> {
    const path = join(repoRoot, CONFIG_FILENAME);
    let parsed: unknown = null;
    if (existsSync(path)) {
        try {
            parsed = JSON.parse(readFileSync(path, 'utf8'));
        } catch {
            parsed = null; // malformed config degrades to the built-ins — a config-less repo still dispatches
        }
    }
    return resolve_runner(parse_runner_config(parsed), requested);
}
