// ReconcileEngine — spec staleness (ADR-0108 item 4; SPEC-spec-staleness-detection). For each spec
// that records a `snapshot:` SHA, diff its `## Affected areas` paths between that SHA and the working
// tree; any change flags the spec as possibly stale. ADVISORY — a warning, no C-id, no checks.yaml,
// never blocking — until measured and promoted (ADR-0063; DOCER has false positives). Co-located v0:
// the diff runs in the workspace's OWN repo, so a cross-root area (a path in a sibling repo) simply
// never matches a changed file here — it degrades to silence, never a false flag. Read-only.

import { readFileSync } from 'fs';

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { paths_changed_since } from '../../Workspace/useCases/index.ts';
import { find_workspace_spec_files } from './findSpecFiles.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type StaleSpec = Readonly<{
    path: string; // the spec file path
    id: string | null; // the spec's frontmatter id
    snapshot: string; // the recorded snapshot SHA the areas were compared against
    changedAreas: readonly string[]; // the Affected-areas paths that drifted since the snapshot
}>;

export type StalenessReport = Readonly<{
    // Always `clean`: this is a read-only advisory report, never a finding/verdict.
    level: OutcomeLevel;
    stale: readonly StaleSpec[];
    scanned: number; // eligible specs (non-draft, carrying a snapshot) the scan actually compared
}>;

export type ScanStalenessInput = Readonly<{ workspaceDir: string; repoRoot: string }>;

// The `## Affected areas` section's backtick-wrapped paths. A path-shaped token contains a slash or a
// dot-extension and is not a `{{placeholder}}` — so a prose backtick (e.g. `corpus check`) is ignored.
function affected_area_paths(source: string): string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    const out: string[] = [];
    let inSection = false;
    for (const line of lines) {
        const heading = /^##\s+(.*\S)\s*$/.exec(line);
        if (heading !== null) {
            inSection = /^affected areas$/i.test(heading[1].trim());
            continue;
        }
        if (!inSection) {
            continue;
        }
        for (const match of line.matchAll(/`([^`]+)`/g)) {
            const path = match[1].trim();
            if (!path.includes('{{') && (path.includes('/') || /\.\w+$/.test(path))) {
                out.push(path);
            }
        }
    }
    return out;
}

// A changed file is "under" a declared area when it equals it or sits beneath it as a directory.
function is_under(changed: string, area: string): boolean {
    const a = area.replace(/\/+$/, '');
    return changed === a || changed.startsWith(`${a}/`);
}

export function scan_spec_staleness(input: ScanStalenessInput): Result<StalenessReport, AppError> {
    const stale: StaleSpec[] = [];
    let scanned = 0;
    for (const specPath of find_workspace_spec_files(input.workspaceDir)) {
        const source = readFileSync(specPath, 'utf8');
        const parsed = parse_spec_record({ source, path: specPath });
        if (!isOk(parsed)) {
            continue;
        }
        const fm = parsed.value.frontmatter;
        // Draft = work-in-progress (mirrors the other spec checks' draft guard); no snapshot = nothing
        // to compare. Either way there is no staleness signal — skip without flagging (0-FP).
        if (fm.status === 'draft' || fm.snapshot === null) {
            continue;
        }
        scanned += 1;
        const changed = paths_changed_since(input.repoRoot, fm.snapshot);
        if (changed === null) {
            continue; // the SHA does not resolve in this repo / git unavailable — skip (0-FP)
        }
        const areas = affected_area_paths(source);
        const changedAreas = areas.filter((area) => changed.some((file) => is_under(file, area)));
        if (changedAreas.length > 0) {
            stale.push({ path: specPath, id: fm.id, snapshot: fm.snapshot, changedAreas });
        }
    }
    return ok({ level: 'clean', stale, scanned });
}
