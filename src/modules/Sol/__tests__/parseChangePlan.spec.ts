import { describe, it, expect } from 'vitest';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { parse_change_plan } from '../useCases/parseChangePlan.ts';

// A trimmed-but-faithful change plan in the canonical shape: the canon transformation fixture's
// structure — preserves[], a guarantees table (with a plan-local PG-NNN),
// and waves that each name a green check.
const PLAN = `---
type: change-plan
id: CHANGE-x
status: draft
kind: schema-change
owner: team
sources: [INV-x]
preserves: [SPEC-checkout#AC-002, SPEC-checkout#AC-003]
created: 2026-06-11
---

# Change Plan: x

## Preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| SPEC-checkout#AC-002 | A charge writes the order | \`npm test -- order.spec.ts\` |
| SPEC-checkout#AC-003 | A charge appends the ledger | \`npm test -- inventory.spec.ts\` |
| PG-001 | The reconciliation job returns the same rows | \`npm test -- reconcile.spec.ts\` |

## Transformation waves

1. Create the new schema; dual-write. Green check: \`npm test -- inventory.spec.ts\`.
2. Backfill; cut reads over. Green check: \`npm test -- reconcile.spec.ts\`.
3. Stop dual-writing; drop the old table. Green check: the full suite.

## Cutover conditions

- something
`;

describe('parse_change_plan', () => {
    it('reads kind and the preserves[] refs, classifying spec refs vs plan-local ids', () => {
        const plan = assertOk(parse_change_plan({ source: PLAN, path: 'change-plan.md' }));
        expect(plan.kind).toBe('schema-change');
        const fromFrontmatter = plan.preservedRefs.filter((ref) => ref.line < 10);
        expect(fromFrontmatter.map((ref) => ref.raw)).toEqual(['SPEC-checkout#AC-002', 'SPEC-checkout#AC-003']);
        const ac002 = plan.preservedRefs.find((ref) => ref.raw === 'SPEC-checkout#AC-002');
        expect(ac002?.specId).toBe('SPEC-checkout');
        expect(ac002?.acId).toBe('AC-002');
    });

    it('reads the guarantees-table ids (including the plan-local PG-001) into preservedRefs + guaranteeIds', () => {
        const plan = assertOk(parse_change_plan({ source: PLAN, path: 'change-plan.md' }));
        expect(plan.guaranteeIds).toContain('PG-001');
        expect(plan.guaranteeIds).toContain('SPEC-checkout#AC-002');
        const pg = plan.preservedRefs.find((ref) => ref.raw === 'PG-001');
        expect(pg?.specId).toBeNull();
        expect(pg?.acId).toBeNull();
    });

    it('does not recognize the obsolete longer guarantees heading', () => {
        const obsolete = PLAN.replace('## Preservation guarantees', '## Behavioral preservation guarantees');
        const plan = assertOk(parse_change_plan({ source: obsolete, path: 'change-plan.md' }));
        expect(plan.guaranteeIds).toEqual([]);
    });

    it('reads the transformation waves and whether each names a green check', () => {
        const plan = assertOk(parse_change_plan({ source: PLAN, path: 'change-plan.md' }));
        expect(plan.waves).toHaveLength(3);
        expect(plan.waves.every((wave) => wave.namesCheck)).toBe(true);
        expect(plan.waves[2].text).toContain('the full suite');
    });

    it('reads indented section headings with closing hashes', () => {
        const source = PLAN.replace('## Preservation guarantees', '   ## Preservation guarantees ##').replace(
            '## Transformation waves',
            '   ## Transformation waves ##'
        );
        const plan = assertOk(parse_change_plan({ source, path: 'change-plan.md' }));
        expect(plan.guaranteeIds).toContain('PG-001');
        expect(plan.waves).toHaveLength(3);
    });

    it('does not let an H1 extend the Transformation waves section', () => {
        const source = PLAN.replace(
            '1. Create the new schema; dual-write. Green check: `npm test -- inventory.spec.ts`.',
            '# Outside waves\n\n1. This list item is not a wave. Green check: `false`.'
        );
        expect(assertOk(parse_change_plan({ source, path: 'change-plan.md' })).waves).toEqual([]);
    });

    it('marks a wave that names no check, and an absent waves section as no waves', () => {
        const noCheck = assertOk(
            parse_change_plan({
                source: PLAN.replace('. Green check: `npm test -- inventory.spec.ts`.', ' with no check named.'),
                path: 'p.md',
            })
        );
        expect(noCheck.waves[0].namesCheck).toBe(false);

        const empty = assertOk(
            parse_change_plan({
                source: PLAN.replace(/## Transformation waves[\s\S]*?(?=## Cutover)/, ''),
                path: 'p.md',
            })
        );
        expect(empty.waves).toEqual([]);
    });

    it('folds an indented continuation line into the open wave (a check named on a later line counts)', () => {
        const wrapped = `---
type: change-plan
id: CHANGE-y
kind: migration
---

## Transformation waves

1. Create the new schema and dual-write old and new from appendLedger.
   Green check: \`npm test -- inventory.spec.ts\`.
`;
        const plan = assertOk(parse_change_plan({ source: wrapped, path: 'p.md' }));
        expect(plan.waves).toHaveLength(1);
        expect(plan.waves[0].namesCheck).toBe(true);
    });

    it('tolerates a flow-style preserves list and a bare PG-only plan', () => {
        const plan = assertOk(
            parse_change_plan({
                source: '---\ntype: change-plan\nid: X\npreserves: [PG-001]\n---\n# x\n',
                path: 'p.md',
            })
        );
        expect(plan.preservedRefs.map((ref) => ref.raw)).toEqual(['PG-001']);
        expect(plan.kind).toBeNull();
    });

    it('fails when the source has no frontmatter fence', () => {
        const failure = assertErr(parse_change_plan({ source: '# no frontmatter\n', path: 'p.md' }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('ignores a malformed/empty guarantees-table row (a bare pipe), not a crash', () => {
        const malformed = `---
type: change-plan
id: X
---

## Preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
|
| PG-001 | local | \`t\` |
`;
        const plan = assertOk(parse_change_plan({ source: malformed, path: 'p.md' }));
        expect(plan.guaranteeIds).toEqual(['PG-001']);
    });

    it('parses a GFM guarantees table with no outer pipes', () => {
        const source = `---
type: change-plan
id: X
---

## Preservation guarantees

ID | Behavior | Verify with
--- | --- | ---
PG-001 | local | \`t\`
`;
        const plan = assertOk(parse_change_plan({ source, path: 'p.md' }));
        expect(plan.guaranteeIds).toEqual(['PG-001']);
        expect(plan.preservedRefs.map((ref) => ref.raw)).toEqual(['PG-001']);
    });

    it('does not parse an aligned GFM delimiter as a preservation ref', () => {
        const source = `---
type: change-plan
id: X
---

## Preservation guarantees

| ID | Behavior | Verify with |
| :--- | :---: | ---: |
| PG-001 | local | \`t\` |
`;
        const plan = assertOk(parse_change_plan({ source, path: 'p.md' }));
        expect(plan.guaranteeIds).toEqual(['PG-001']);
        expect(plan.preservedRefs.map((ref) => ref.raw)).toEqual(['PG-001']);
    });

    it('parses a block-style preserves list', () => {
        const block = `---
type: change-plan
id: X
preserves:
  - SPEC-a#AC-001
  - PG-002
---
# x
`;
        const plan = assertOk(parse_change_plan({ source: block, path: 'p.md' }));
        expect(plan.preservedRefs.map((ref) => ref.raw)).toEqual(['SPEC-a#AC-001', 'PG-002']);
    });

    it('normalizes quotes and inline comments in preserves-list items', () => {
        const source = `---
type: change-plan
id: X
preserves:
  - "SPEC-a#AC-001" # primary
  - 'PG-002'
---
# x
`;
        const plan = assertOk(parse_change_plan({ source, path: 'p.md' }));
        expect(plan.preservedRefs.map((ref) => ref.raw)).toEqual(['SPEC-a#AC-001', 'PG-002']);
    });

    it('a fenced `## ` heading is not a section switch; a fenced numbered item is not a wave', () => {
        const fenced = `---
type: change-plan
id: X
---

## Preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| PG-001 | real | \`t\` |

\`\`\`md
## Transformation waves

1. A quoted wave example with no check named.
\`\`\`

## Transformation waves

1. The real wave. Green check: \`pnpm test\`.
`;
        const plan = assertOk(parse_change_plan({ source: fenced, path: 'p.md' }));
        expect(plan.guaranteeIds).toEqual(['PG-001']); // the section was not false-closed by the fenced H2
        expect(plan.waves).toHaveLength(1); // the fenced example item is not a wave entry
        expect(plan.waves[0].namesCheck).toBe(true);
    });
});
