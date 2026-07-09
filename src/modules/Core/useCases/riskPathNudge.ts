// The shared risk-path hook (SPEC-suspec-v2 AC-022): read `risk_paths` from the consumer-side
// suspec.config.json, match the given changed files, and return the one advisory line — or null
// when nothing is declared or nothing matches. `check-my-work` (the repo diff) and `done` (the
// run's worktree diff) both wire this; it is ADVISORY by construction — never blocking, and any
// miss (no config, malformed config, no match) is silence, never an error.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { match_risk_paths, parse_risk_paths, risk_nudge_line } from '../services/riskPaths.ts';

const CONFIG_FILENAME = 'suspec.config.json';

export function risk_path_nudge(repoRoot: string, changedFiles: readonly string[]): string | null {
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
    return risk_nudge_line(match_risk_paths(changedFiles, parse_risk_paths(raw)));
}
