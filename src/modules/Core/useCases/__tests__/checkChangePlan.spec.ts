import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { check_change_plan } from '../checkChangePlan.ts';
import { build_spec_ref_resolver } from '../resolveSpecRef.ts';
import { find_sibling_spec_files } from '../findSpecFiles.ts';
import { resolve_canon_root } from '../../testing/resolveCanonRoot.ts';

const codes = (diagnostics: readonly { code: string }[]) => diagnostics.map((d) => d.code);

// A minimal change plan in the canonical shape, parameterized so each variant test edits one field.
function plan(opts: { kind?: string; preserves?: string; waves?: string; guarantees?: string } = {}): string {
    const kind = opts.kind ?? 'schema-change';
    const preserves = opts.preserves ?? '[SPEC-checkout#AC-002, SPEC-checkout#AC-003]';
    const guarantees =
        opts.guarantees ??
        `| SPEC-checkout#AC-002 | order | \`npm test -- a.spec.ts\` |
| SPEC-checkout#AC-003 | ledger | \`npm test -- b.spec.ts\` |
| PG-001 | reconcile | \`npm test -- c.spec.ts\` |`;
    const waves =
        opts.waves ??
        `1. Create the schema. Green check: \`npm test -- a.spec.ts\`.
2. Cut over. Green check: \`npm test -- c.spec.ts\`.`;
    return `---
type: change-plan
id: CHANGE-x
status: draft
kind: ${kind}
preserves: ${preserves}
---

# Change Plan

## Preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
${guarantees}

## Transformation waves

${waves}
`;
}

// SPEC-checkout defines AC-002 and AC-003 (the checkout fixture). The unit tests inject this
// resolver directly so they do not depend on the filesystem.
const checkoutResolver = (specId: string, acId: string) =>
    specId === 'SPEC-checkout' && (acId === 'AC-002' || acId === 'AC-003');

describe('check_change_plan — C010/C011 (AC-001/002/003)', () => {
    it('a valid plan (refs resolve, PG-001 plan-local, waves named) is clean', () => {
        const report = assertOk(
            check_change_plan({ source: plan(), path: 'p.md', spec_ref_resolves: checkoutResolver })
        );
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('AC-002: an unresolvable SPEC-checkout#AC-999 ref → one C010 hard-error → blocking', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({
                    preserves: '[SPEC-checkout#AC-999]',
                    guarantees: '| SPEC-checkout#AC-999 | nope | `t` |',
                }),
                path: 'p.md',
                spec_ref_resolves: checkoutResolver,
            })
        );
        // the same unresolved ref appears in preserves: and the table — reported once (deduped by raw)
        expect(codes(report.diagnostics)).toEqual(['C010']);
        expect(report.diagnostics[0].message).toContain('SPEC-checkout#AC-999');
        expect(report.level).toBe('blocking');
    });

    it('C010 reads unresolved refs from the canonical Preservation guarantees heading', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ preserves: '[]', guarantees: '| SPEC-missing#AC-999 | nope | `t` |' }),
                path: 'p.md',
                spec_ref_resolves: () => false,
            })
        );
        expect(codes(report.diagnostics)).toEqual(['C010']);
        expect(report.diagnostics[0].message).toContain('SPEC-missing#AC-999');
    });

    it('AC-002: a PG-NNN plan-local id produces no C010 finding', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ preserves: '[PG-001]', guarantees: '| PG-001 | local | `t` |' }),
                path: 'p.md',
                spec_ref_resolves: () => false,
            })
        );
        expect(codes(report.diagnostics)).toEqual([]);
    });

    it('AC-002: a bare non-PG guarantee id is not a valid plan-local preservation ref', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ preserves: '[AC-777]', guarantees: '| AC-777 | invalid local id | `t` |' }),
                path: 'p.md',
                spec_ref_resolves: () => false,
            })
        );
        expect(codes(report.diagnostics)).toEqual(['C010']);
        expect(report.level).toBe('blocking');
    });

    it('AC-003: a kind: migration plan with an empty waves section → one C011 warning', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ kind: 'migration', waves: '' }),
                path: 'p.md',
                spec_ref_resolves: checkoutResolver,
            })
        );
        expect(codes(report.diagnostics)).toEqual(['C011']);
        expect(report.level).toBe('warning');
    });

    it('AC-003: mentioning an inline-code path does not count as naming a verify step', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ kind: 'migration', waves: '1. Create the `db/inventory` schema.' }),
                path: 'p.md',
                spec_ref_resolves: checkoutResolver,
            })
        );
        expect(codes(report.diagnostics)).toEqual(['C011']);
        expect(report.level).toBe('warning');
    });

    it('AC-003: a plan of another kind with an empty waves section is exempt (no C011)', () => {
        const report = assertOk(
            check_change_plan({
                source: plan({ kind: 'refactor', waves: '' }),
                path: 'p.md',
                spec_ref_resolves: checkoutResolver,
            })
        );
        expect(codes(report.diagnostics)).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('returns Err for an unparseable change plan (no frontmatter fence)', () => {
        const result = check_change_plan({ source: '# no fence\n', path: 'p.md', spec_ref_resolves: () => true });
        expect(result.ok).toBe(false);
    });
});

// AC-004: the frozen transformation fixture is the oracle — C010 pass, C011 pass (EXPECTED.md).
// Reached the same way the contract drift guard reaches the sibling Suspec canon (resolve_canon_root:
// SUSPEC_CANON, `../suspec`, or any canon-shaped sibling). CONDITIONAL on that checkout: in a
// hermetic suspec-cli-only checkout the fixture isn't
// on disk, so this oracle CANNOT run and no-ops (SKIPPED below, never silently green). We deliberately
// do NOT vendor a fixture copy here (it would become a second source of truth that could drift from
// the canon it pins). The skip is named + warned so an absent sibling is a visible signal in the run,
// not a silent pass.
describe('check_change_plan reproduces the transformation fixture (AC-004)', () => {
    const canonRoot = resolve_canon_root(process.cwd());
    const fixtureDir = canonRoot === null ? '' : resolve(canonRoot, 'checks/fixtures/transformation');
    const planPath = fixtureDir === '' ? '' : resolve(fixtureDir, 'change-plan.md');
    const present = planPath !== '' && existsSync(planPath);
    if (!present) {
        console.warn(
            `[no-op] transformation-fixture oracle SKIPPED: no sibling suspec canon found (SUSPEC_CANON / ../suspec / canon-shaped sibling) — provide one for AC-004 to bite`
        );
    }
    const fixtureName = present
        ? 'the fixture change-plan reports zero C010 and zero C011 (matches EXPECTED.md)'
        : 'the fixture change-plan reports zero C010 and zero C011 (matches EXPECTED.md) (SKIPPED: no sibling suspec canon)';

    (present ? it : it.skip)(fixtureName, () => {
        const resolver = build_spec_ref_resolver(find_sibling_spec_files(planPath));
        const report = assertOk(
            check_change_plan({ source: readFileSync(planPath, 'utf8'), path: planPath, spec_ref_resolves: resolver })
        );
        expect(report.diagnostics.filter((d) => d.code === 'C010')).toEqual([]);
        expect(report.diagnostics.filter((d) => d.code === 'C011')).toEqual([]);
        expect(report.level).toBe('clean');
    });
});

describe('check_change_plan — wave continuation (#23 A4)', () => {
    it('A4: a closing paragraph after the wave list does not mask a check-less wave from C011', () => {
        const source = [
            '---',
            'type: change-plan',
            'id: CHANGE-a4',
            'title: A4',
            'status: draft',
            'kind: migration',
            'owner: Jane',
            'sources: [SPEC-x]',
            'preserves: [PG-001]',
            'created: 2026-06-19',
            '---',
            '',
            '## Preservation guarantees',
            '',
            '| ID | Behavior | Verify with |',
            '|---|---|---|',
            '| PG-001 | x stays | `npm test` |',
            '',
            '## Transformation waves',
            '',
            '1. Move the callsites, run `npm test`',
            '2. Delete the old API A shim',
            '',
            'Throughout, the suite `npm test` stays green.',
        ].join('\n');
        const report = assertOk(
            check_change_plan({ source, path: 'change-plans/a4.md', spec_ref_resolves: () => true })
        );
        expect(report.diagnostics.some((d) => d.code === 'C011')).toBe(true);
    });
});
