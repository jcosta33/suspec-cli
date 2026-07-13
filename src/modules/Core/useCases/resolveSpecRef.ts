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
    return (specId: string, acId: string) => index.get(specId)?.has(acId) === true;
}
