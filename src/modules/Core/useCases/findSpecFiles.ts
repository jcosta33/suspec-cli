// Locate the candidate spec files a change-plan's C010 resolves `SPEC-x#AC-NNN` refs against —
// ARTIFACT-RELATIVE, per the contract's C010 rule (checks.yaml: refs resolve against the plan's
// sibling specs): the plan's sibling `*/spec.md` files (a spec laid out beside the plan, e.g.
// `../checkout/spec.md` from `transformation/change-plan.md`). One level beside the plan, never a
// tree walk. Reads the filesystem; returns plain paths. The resolver (build_spec_ref_resolver)
// reads + indexes them — this only enumerates.

import { readdirSync, existsSync, type Dirent } from 'fs';
import { join, dirname, resolve } from 'path';

// The `spec.md` files in the change plan's sibling directories — one level only, sorted.
export function find_sibling_spec_files(changePlanPath: string): string[] {
    // Resolve first: on a bare or `./`-prefixed argv path (`suspec check change-plan.md`),
    // dirname-of-dirname collapses to `.` twice — landing in the plan's OWN directory instead of
    // one level up, silently finding zero sibling specs and false-failing C010.
    const planDir = dirname(resolve(changePlanPath));
    const parentDir = dirname(planDir);
    if (!existsSync(parentDir)) {
        return [];
    }
    // `withFileTypes` reads the dir-entry kind from the single readdir, so a sibling that vanishes
    // between listing and inspection (a parallel temp-dir cleanup) cannot ENOENT a second stat call.
    const entries: Dirent[] = readdirSync(parentDir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) {
            continue;
        }
        const specPath = join(parentDir, entry.name, 'spec.md');
        if (existsSync(specPath)) {
            out.push(specPath);
        }
    }
    return out;
}
