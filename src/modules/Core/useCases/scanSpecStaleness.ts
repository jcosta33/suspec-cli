// ReconcileEngine — spec staleness (ADR-0108 item 4; SPEC-spec-staleness-detection; corpus-cli#2
// cross-root). For each spec that records a `snapshot:` SHA, diff its `## Affected areas` paths between
// that SHA and the working tree; any change flags the spec as possibly stale. ADVISORY — a warning, no
// C-id, no checks.yaml, never blocking — until measured and promoted (ADR-0063; DOCER has false
// positives). CROSS-ROOT: a context-prefixed area (`corpus-cli/src/…`) is resolved to its SIBLING repo
// (`../corpus-cli`) and diffed THERE, so a spec in a dedicated workspace whose code lives in sibling
// repos (the multi-repo layout) is checked correctly; the `snapshot:` SHA resolves in exactly the repo
// it belongs to (others return null → those areas skip). Everything degrades to silence (0-FP): no
// snapshot, draft, unresolvable SHA, no git, missing sibling. Read-only.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

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

// Resolve a declared Affected-area path to the git repo it lives in (corpus-cli#2 cross-root). A
// context-prefixed path (`corpus-cli/src/foo.ts`) whose first segment names a SIBLING git repo
// (`<workspaceParent>/corpus-cli` with a `.git`) resolves to that sibling; everything else resolves to
// the workspace's own repo. Returns the repo root and the area path AS SEEN INSIDE that repo (the
// sibling prefix stripped, so it matches the sibling's repo-relative diff output).
function resolve_area_repo(workspaceDir: string, repoRoot: string, area: string): { repo: string; areaInRepo: string } {
    const slash = area.indexOf('/');
    if (slash > 0) {
        const prefix = area.slice(0, slash);
        const sibling = join(workspaceDir, '..', prefix);
        if (existsSync(join(sibling, '.git'))) {
            return { repo: sibling, areaInRepo: area.slice(slash + 1) };
        }
    }
    return { repo: repoRoot, areaInRepo: area };
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
        const snapshot = fm.snapshot;
        scanned += 1;
        // Per-area repo resolution (cross-root): an area is checked in its OWN repo. The snapshot SHA
        // resolves in exactly the repo it belongs to (paths_changed_since returns null elsewhere → that
        // repo's areas skip). Diffs are cached per repo so a multi-area spec runs one diff per repo.
        const diffByRepo = new Map<string, readonly string[] | null>();
        const changedAreas: string[] = [];
        for (const area of affected_area_paths(source)) {
            const { repo, areaInRepo } = resolve_area_repo(input.workspaceDir, input.repoRoot, area);
            if (!diffByRepo.has(repo)) {
                diffByRepo.set(repo, paths_changed_since(repo, snapshot));
            }
            const changed = diffByRepo.get(repo);
            if (changed === null || changed === undefined) {
                continue; // the SHA does not resolve in this repo / git unavailable — skip (0-FP)
            }
            if (changed.some((file) => is_under(file, areaInRepo))) {
                changedAreas.push(area);
            }
        }
        if (changedAreas.length > 0) {
            stale.push({ path: specPath, id: fm.id, snapshot, changedAreas });
        }
    }
    return ok({ level: 'clean', stale, scanned });
}
