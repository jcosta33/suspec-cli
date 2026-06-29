// C009 (`broken-source-link`) resolution base. A spec's `sources:`/requirement ref is checked against
// the filesystem to decide whether it resolves. The doc-recommended layout (docs/03-where-files-live)
// puts shared artifacts at the WORKSPACE ROOT — `intake/x.md` (what `suspec pull` writes), `decisions/`,
// `inventory/` — while a spec lives at `specs/<feature>/spec.md`; the kit's worked example instead
// co-locates its `ticket.md` BESIDE the spec. Both are legitimate, so a ref resolves when it exists
// relative to EITHER the spec's own directory OR the workspace root — only a ref under neither is a
// broken C009 link. (Before this, C009 resolved spec-dir-only, so a root-level `intake/x.md` sourced
// from `specs/<feature>/spec.md` false-failed unless written as `../../intake/x.md`, which no doc named.)

import { existsSync } from 'fs';
import { dirname, resolve, basename, parse } from 'path';

export function build_source_exists(specPath: string, workspaceRoot: string): (ref: string) => boolean {
    const specDir = dirname(resolve(specPath));
    const root = resolve(workspaceRoot);
    return (ref: string) => existsSync(resolve(specDir, ref)) || existsSync(resolve(root, ref));
}

// The workspace root for a spec file when only the file path is known (single-file `suspec check <file>`):
// the spec lives at `<root>/specs/<feature>/spec.md`, so the workspace root is the PARENT of the nearest
// ancestor `specs/` directory. Keyed on the `specs/` layout rather than an `AGENTS.md` marker, which would
// overshoot to an ancestor monorepo (or a workspace nested inside another suspec repo) that also has one.
// Falls back to the given default (the command's cwd) when the spec is not under a `specs/` dir.
export function infer_workspace_root(specPath: string, fallback: string): string {
    let dir = dirname(resolve(specPath));
    const fsRoot = parse(dir).root;
    while (dir !== fsRoot) {
        if (basename(dir) === 'specs') {
            return dirname(dir);
        }
        dir = dirname(dir);
    }
    return resolve(fallback);
}
