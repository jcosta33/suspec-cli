// Spec staleness at launch (SPEC-suspec-v2 AC-007) — the shipped scan_spec_staleness logic
// re-aimed at ONE store spec (scan_spec_staleness itself survives for the workspace path until the
// later waves retire it). A store spec records `base_sha` + `affected_areas` in FRONTMATTER; this
// compares them against the repo's current state (`git diff <base_sha>` → committed-since + staged
// + unstaged) and reports the drifted files under the declared areas. Everything degrades to
// not-stale (0-FP): no base_sha, no areas, an unresolvable SHA, no git. Read-only — the refusal
// (exit 1 unless --anyway) lives in the command.

import { paths_changed_since } from '../../Workspace/useCases/index.ts';
import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';

export type StoreSpecStaleness = Readonly<{
    stale: boolean;
    baseSha: string | null;
    areas: readonly string[];
    driftedFiles: readonly string[]; // the changed files under the declared areas — what the refusal prints
}>;

export type CheckStoreSpecStalenessInput = Readonly<{ repoRoot: string; specSource: string }>;

// A changed file is "under" a declared area when it equals it or sits beneath it as a directory
// (the same containment rule as scan_spec_staleness).
function is_under(changed: string, area: string): boolean {
    const trimmed = area.replace(/\/+$/, '');
    return changed === trimmed || changed.startsWith(`${trimmed}/`);
}

export function check_store_spec_staleness(input: CheckStoreSpecStalenessInput): StoreSpecStaleness {
    const fm = read_frontmatter(input.specSource);
    const baseSha = fm_scalar(fm.base_sha) ?? null;
    const rawAreas = fm.affected_areas ?? [];
    const areas = typeof rawAreas === 'string' ? [rawAreas] : [...rawAreas];
    if (baseSha === null || areas.length === 0) {
        return { stale: false, baseSha, areas, driftedFiles: [] };
    }
    const changed = paths_changed_since(input.repoRoot, baseSha);
    if (changed === null) {
        return { stale: false, baseSha, areas, driftedFiles: [] }; // SHA unresolvable / no git — skip (0-FP)
    }
    const driftedFiles = changed.filter((file) => areas.some((area) => is_under(file, area)));
    return { stale: driftedFiles.length > 0, baseSha, areas, driftedFiles };
}
