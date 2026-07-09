// Setup v2 (SPEC-suspec-v2 AC-005): the env-complete setup plan `suspec work` executes in the
// worktree before launch. Sources, in order: the `setup` commands declared in the consumer-side
// `suspec.config.json`; when none are declared, the lockfile AUTODETECT fallback (probed against
// the repo root — the worktree checks out the same tree); PLUS, always, the `setup_copy` allowlist
// of gitignored files to copy in. The reads are injectable so the wiring is testable without disk;
// whether a failure blocks or warns is the command's decision (spec_requires_runtime).

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { detect_setup_commands, parse_setup_config, parse_setup_copy } from '../services/setupConfig.ts';

const CONFIG_FILENAME = 'suspec.config.json';

export type SetupPlan = Readonly<{
    commands: readonly string[];
    copies: readonly string[];
    source: 'config' | 'autodetect' | 'none'; // where the commands came from
}>;

export type ResolveSetupPlanInput = Readonly<{
    repoRoot: string;
    readConfig?: (path: string) => string | null;
    exists?: (path: string) => boolean;
}>;

function default_read(path: string): string | null {
    if (!existsSync(path)) {
        return null;
    }
    try {
        return readFileSync(path, 'utf8');
    } catch {
        return null;
    }
}

export function resolve_setup_plan(input: ResolveSetupPlanInput): SetupPlan {
    const read = input.readConfig ?? default_read;
    const exists = input.exists ?? existsSync;
    const raw = read(join(input.repoRoot, CONFIG_FILENAME));
    let parsed: unknown = null;
    if (raw !== null) {
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = null; // malformed config degrades to no declaration — autodetect still runs
        }
    }
    const declared = parse_setup_config(parsed);
    const copies = parse_setup_copy(parsed);
    if (declared.length > 0) {
        return { commands: declared, copies, source: 'config' };
    }
    const detected = detect_setup_commands((name) => exists(join(input.repoRoot, name)));
    return { commands: detected, copies, source: detected.length > 0 ? 'autodetect' : 'none' };
}
