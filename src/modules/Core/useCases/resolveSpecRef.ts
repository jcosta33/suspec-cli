// Build the `spec_ref_resolves` predicate the change-plan check (C010) injects: does a named spec
// (`SPEC-x`) exist among the candidate spec files and define a given anchor (`AC-NNN`)? Reads the
// filesystem; the engine (check_change_plan) stays pure by taking the resulting predicate (it
// indexes the candidate specs by frontmatter id).

import { readFileSync } from 'fs';

import { parse_spec_record } from '../../Sol/useCases/index.ts';

// A spec-id → defined-requirement-id set, built from the candidate spec files. A file that does not
// parse or carries no frontmatter id is skipped (it cannot be a resolution target).
export function build_spec_ref_resolver(specFiles: readonly string[]): (specId: string, acId: string) => boolean {
    const index = new Map<string, Set<string>>();
    for (const specPath of specFiles) {
        const parsed = parse_spec_record({ source: readFileSync(specPath, 'utf8'), path: specPath });
        if (!parsed.ok) {
            continue;
        }
        const id = parsed.value.frontmatter.id;
        if (id === null) {
            continue;
        }
        const acIds = index.get(id) ?? new Set<string>();
        for (const requirement of parsed.value.requirements) {
            acIds.add(requirement.id);
        }
        index.set(id, acIds);
    }
    const ids = [...index.keys()];
    // Resolve a referenced spec id to an index key: an EXACT frontmatter-id match first; else the UNIQUE
    // id that extends it with the numeric-slug convention `SPEC-NNN-<slug>`. So a `SPEC-001#AC-001` ref
    // written with the natural numeric shorthand resolves to `SPEC-001-ai-rpg-dialogue` — the slip a real
    // workspace's change-plan guarantee tables hit at scale (the preserves: frontmatter carried the full
    // id while the table used the short one, false-failing C010 across dozens of plans). Ambiguous (more
    // than one `SPEC-NNN-…`) or no match → no resolution: the resolver never guesses between candidates.
    const resolve_key = (specId: string): string | null => {
        if (index.has(specId)) {
            return specId;
        }
        const extensions = ids.filter((id) => id.startsWith(`${specId}-`));
        return extensions.length === 1 ? extensions[0] : null;
    };
    return (specId: string, acId: string) => {
        const key = resolve_key(specId);
        return key !== null && index.get(key)?.has(acId) === true;
    };
}
