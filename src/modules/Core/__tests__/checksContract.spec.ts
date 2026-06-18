import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    CONTRACT_VERSION,
    CORE_CHECKS,
    severity_of,
    is_workspace_ref,
    check_unique_ids,
    check_verify_with,
    check_one_strength_word,
    check_non_goals,
    check_open_questions,
    check_no_tbd_at_ready,
    check_sources_named,
    check_broken_source_link,
    check_coverage,
    check_verify_binding,
    verify_binding_facts,
    type VerifyBindingInput,
    check_preserves_refs_resolve,
    check_waves_present,
    run_spec_checks,
    verdict_for,
    type ParsedSpec,
    type Requirement,
    type SpecFrontmatter,
    type Diagnostic,
    type PreservesRef,
} from '../services/checksContract.ts';

function spec(
    overrides: Partial<Omit<ParsedSpec, 'frontmatter'>> & { frontmatter?: Partial<SpecFrontmatter> } = {}
): ParsedSpec {
    const { frontmatter, ...rest } = overrides;
    return {
        frontmatter: {
            type: 'spec',
            id: 'SPEC-x',
            status: 'draft',
            format: null,
            sources: ['ADR-0077'],
            ...frontmatter,
        },
        requirements: [],
        sectionTitles: ['Non-goals', 'Open questions'],
        nonGoalsBody: 'what this does not change',
        openQuestionsPresent: true,
        bodyText: '',
        links: [],
        ...rest,
    };
}

function req(id: string, body: string, line = 1): Requirement {
    return { id, line, body };
}

const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map((d) => d.code);

describe('severity_of', () => {
    it('returns the contract severity per check id', () => {
        expect(severity_of('C001')).toBe('hard-error');
        expect(severity_of('C003')).toBe('hard-error');
        expect(severity_of('C004')).toBe('warning');
        expect(severity_of('C009')).toBe('hard-error');
        expect(severity_of('C010')).toBe('hard-error');
        expect(severity_of('C011')).toBe('warning');
        expect(severity_of('C012')).toBe('warning');
        expect(severity_of('C013')).toBe('warning');
    });
});

describe('C012 coverage (ADR-0079)', () => {
    it('flags an in-scope id with no coverage row as uncovered', () => {
        const diagnostics = check_coverage({
            sourceSpecStatus: 'ready',
            inScopeIds: ['AC-001', 'AC-002', 'AC-003'],
            specRequirementIds: ['AC-001', 'AC-002', 'AC-003'],
            coverageRowIds: ['AC-001'],
        });
        expect(codes(diagnostics)).toEqual(['C012', 'C012']);
        expect(diagnostics.map((d) => d.message)).toEqual([
            'requirement AC-002 is in scope but has no coverage row (uncovered)',
            'requirement AC-003 is in scope but has no coverage row (uncovered)',
        ]);
        expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    });

    it('flags a coverage row whose id is absent from the source spec as orphan', () => {
        const diagnostics = check_coverage({
            sourceSpecStatus: 'ready',
            inScopeIds: ['AC-001'],
            specRequirementIds: ['AC-001'],
            coverageRowIds: ['AC-001', 'AC-009'],
        });
        expect(codes(diagnostics)).toEqual(['C012']);
        expect(diagnostics[0].message).toBe(
            'coverage row AC-009 names an id absent from the source spec (orphan)'
        );
    });

    it('surfaces both faces together: uncovered + orphan', () => {
        const diagnostics = check_coverage({
            sourceSpecStatus: 'ready',
            inScopeIds: ['AC-001', 'AC-002'],
            specRequirementIds: ['AC-001', 'AC-002'],
            coverageRowIds: ['AC-001', 'AC-009'],
        });
        expect(diagnostics.map((d) => d.message)).toEqual([
            'requirement AC-002 is in scope but has no coverage row (uncovered)',
            'coverage row AC-009 names an id absent from the source spec (orphan)',
        ]);
    });

    it('is exempt on a draft source spec (the scope guard)', () => {
        expect(
            check_coverage({
                sourceSpecStatus: 'draft',
                inScopeIds: ['AC-001', 'AC-002'],
                specRequirementIds: ['AC-001'],
                coverageRowIds: [],
            })
        ).toEqual([]);
    });

    it('a packet covering exactly the in-scope ids yields no finding', () => {
        expect(
            check_coverage({
                sourceSpecStatus: 'ready',
                inScopeIds: ['AC-001', 'AC-002'],
                specRequirementIds: ['AC-001', 'AC-002', 'AC-003'],
                coverageRowIds: ['AC-001', 'AC-002'],
            })
        ).toEqual([]);
    });

    it('reports a repeated orphan id only once', () => {
        const diagnostics = check_coverage({
            sourceSpecStatus: 'ready',
            inScopeIds: [],
            specRequirementIds: ['AC-001'],
            coverageRowIds: ['AC-009', 'AC-009'],
        });
        expect(codes(diagnostics)).toEqual(['C012']);
    });
});

describe('C013 verify-evidence-binding (ADR-0083, AC-005)', () => {
    const base = (over: Partial<VerifyBindingInput> = {}): VerifyBindingInput => ({
        sourceSpecStatus: 'ready',
        namedCommandById: new Map([['AC-001', 'npm test -- auth-refresh.spec.ts']]),
        coverageRows: [{ id: 'AC-001', result: 'Pass' }],
        verifyBlocks: [],
        ...over,
    });

    it('a matching block (cmd == named command, result=pass) yields no finding', () => {
        expect(
            verify_binding_facts(
                base({
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
                    ],
                })
            )
        ).toEqual([]);
    });

    it('matches a cmd by closed-value, exact after whitespace-collapse (not prose)', () => {
        expect(
            verify_binding_facts(
                base({
                    // extra internal whitespace collapses to the same closed value → still consistent
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm  test   --  auth-refresh.spec.ts', result: 'pass', malformed: false },
                    ],
                })
            )
        ).toEqual([]);
    });

    it('a cmd that disagrees with the named command → a cmd-mismatch fact', () => {
        const facts = verify_binding_facts(
            base({
                verifyBlocks: [{ id: 'AC-001', cmd: 'npm test -- other.spec.ts', result: 'pass', malformed: false }],
            })
        );
        expect(facts).toEqual([{ id: 'AC-001', kind: 'cmd-mismatch' }]);
        expect(check_verify_binding(base({
            verifyBlocks: [{ id: 'AC-001', cmd: 'npm test -- other.spec.ts', result: 'pass', malformed: false }],
        }))[0]).toMatchObject({ code: 'C013', severity: 'warning' });
    });

    it('a result=fail under a Pass row → a result-fail fact', () => {
        expect(
            verify_binding_facts(
                base({
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'fail', malformed: false },
                    ],
                })
            )
        ).toEqual([{ id: 'AC-001', kind: 'result-fail' }]);
    });

    it('a malformed block under a Pass row → a malformed fact', () => {
        expect(
            verify_binding_facts(
                base({ verifyBlocks: [{ id: 'AC-001', cmd: null, result: 'pass', malformed: true }] })
            )
        ).toEqual([{ id: 'AC-001', kind: 'malformed' }]);
    });

    it('an unkeyed (id-less) malformed block is surfaced on its own', () => {
        expect(
            verify_binding_facts(base({ verifyBlocks: [{ id: null, cmd: 'x', result: 'pass', malformed: true }] }))
        ).toEqual([
            { id: '(unkeyed)', kind: 'malformed' },
            // the Pass row still has no block → free-form-only
            { id: 'AC-001', kind: 'free-form-only' },
        ]);
    });

    it('more than one block keyed to the same id → a duplicate fact', () => {
        const facts = verify_binding_facts(
            base({
                verifyBlocks: [
                    { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
                    { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
                ],
            })
        );
        expect(facts.some((f) => f.kind === 'duplicate' && f.id === 'AC-001')).toBe(true);
    });

    it('a Pass row with no verify block (free-form cell only) → a free-form-only warning', () => {
        expect(verify_binding_facts(base({ verifyBlocks: [] }))).toEqual([
            { id: 'AC-001', kind: 'free-form-only' },
        ]);
    });

    it('a non-Pass row is not subject to the free-form-only warning', () => {
        expect(
            verify_binding_facts(base({ coverageRows: [{ id: 'AC-001', result: 'Unverified' }], verifyBlocks: [] }))
        ).toEqual([]);
    });

    it('a draft source spec is exempt (the scope guard) — no C013 at all', () => {
        expect(
            verify_binding_facts(
                base({
                    sourceSpecStatus: 'draft',
                    coverageRows: [{ id: 'AC-001', result: 'Pass' }],
                    verifyBlocks: [{ id: 'AC-001', cmd: 'wrong', result: 'fail', malformed: false }],
                })
            )
        ).toEqual([]);
    });

    it('a Pass row whose requirement names no command cannot match a recorded cmd → cmd-mismatch', () => {
        expect(
            verify_binding_facts(
                base({
                    namedCommandById: new Map([['AC-001', null]]),
                    verifyBlocks: [{ id: 'AC-001', cmd: 'a test', result: 'pass', malformed: false }],
                })
            )
        ).toEqual([{ id: 'AC-001', kind: 'cmd-mismatch' }]);
    });
});

describe('C010 preserves-refs-resolve (change-plan, AC-002)', () => {
    const ref = (raw: string, specId: string | null = null, acId: string | null = null): PreservesRef => ({
        raw,
        specId,
        acId,
        line: 10,
    });

    it('resolves a SPEC-x#AC-NNN ref via the injected resolver, and flags an unresolvable one', () => {
        const resolves = (specId: string, acId: string) => specId === 'SPEC-checkout' && acId === 'AC-002';
        // a resolving cross-spec ref → no finding
        expect(
            check_preserves_refs_resolve({
                refs: [ref('SPEC-checkout#AC-002', 'SPEC-checkout', 'AC-002')],
                guaranteeIds: [],
                spec_ref_resolves: resolves,
            })
        ).toEqual([]);
        // an absent anchor (#AC-999) → one C010 hard-error citing the ref
        const missing = check_preserves_refs_resolve({
            refs: [ref('SPEC-checkout#AC-999', 'SPEC-checkout', 'AC-999')],
            guaranteeIds: [],
            spec_ref_resolves: resolves,
        });
        expect(codes(missing)).toEqual(['C010']);
        expect(missing[0].severity).toBe('hard-error');
        expect(missing[0].message).toContain('SPEC-checkout#AC-999');
        expect(missing[0].line).toBe(10);
    });

    it('treats a PG-NNN defined in the guarantees table as a valid plan-local id (no finding)', () => {
        expect(
            check_preserves_refs_resolve({
                refs: [ref('PG-001')],
                guaranteeIds: ['PG-001'],
                spec_ref_resolves: () => false,
            })
        ).toEqual([]);
    });

    it('flags a plan-local id that is NOT defined in the guarantees table', () => {
        const diagnostics = check_preserves_refs_resolve({
            refs: [ref('PG-404')],
            guaranteeIds: ['PG-001'],
            spec_ref_resolves: () => false,
        });
        expect(codes(diagnostics)).toEqual(['C010']);
        expect(diagnostics[0].message).toContain('PG-404');
    });

    it('reports a duplicated unresolvable ref only once', () => {
        const diagnostics = check_preserves_refs_resolve({
            refs: [ref('PG-404'), ref('PG-404')],
            guaranteeIds: [],
            spec_ref_resolves: () => false,
        });
        expect(codes(diagnostics)).toEqual(['C010']);
    });
});

describe('C011 waves-present (change-plan, AC-003)', () => {
    const wave = (namesCheck: boolean, line: number | null = 20) => ({ namesCheck, line });

    it('warns when a wave-required kind has an empty Transformation waves section', () => {
        const diagnostics = check_waves_present({ kind: 'migration', waves: [] });
        expect(codes(diagnostics)).toEqual(['C011']);
        expect(diagnostics[0].severity).toBe('warning');
        expect(diagnostics[0].message).toContain('migration');
    });

    it('warns when a wave names no green check, citing the offending wave line', () => {
        const diagnostics = check_waves_present({ kind: 'rewrite', waves: [wave(true, 20), wave(false, 25)] });
        expect(codes(diagnostics)).toEqual(['C011']);
        expect(diagnostics[0].line).toBe(25);
    });

    it('passes a wave-required kind whose waves each name a check', () => {
        expect(check_waves_present({ kind: 'schema-change', waves: [wave(true), wave(true)] })).toEqual([]);
    });

    it('exempts a plan of another kind, and a plan with no kind', () => {
        expect(check_waves_present({ kind: 'refactor', waves: [] })).toEqual([]);
        expect(check_waves_present({ kind: 'mechanical-cleanup', waves: [wave(false)] })).toEqual([]);
        expect(check_waves_present({ kind: null, waves: [] })).toEqual([]);
    });
});

describe('is_workspace_ref', () => {
    it('treats paths and doc-like files as workspace refs', () => {
        expect(is_workspace_ref('specs/x/spec.md')).toBe(true);
        expect(is_workspace_ref('../swarm/checks/checks.yaml')).toBe(true);
        expect(is_workspace_ref('file.md')).toBe(true);
        expect(is_workspace_ref('config.json')).toBe(true);
    });

    it('exempts bare tracker ids, urls, prose tokens, and bare cross-refs', () => {
        expect(is_workspace_ref('JIRA-123')).toBe(false);
        expect(is_workspace_ref('ADR-0077')).toBe(false);
        expect(is_workspace_ref('https://example.com')).toBe(false);
        expect(is_workspace_ref('http://example.com')).toBe(false);
        expect(is_workspace_ref('mailto:a@b.c')).toBe(false);
        expect(is_workspace_ref('plainword')).toBe(false);
        expect(is_workspace_ref('e.g.')).toBe(false);
        expect(is_workspace_ref('#a-heading')).toBe(false);
        expect(is_workspace_ref('   ')).toBe(false);
    });
});

describe('C001 unique-ids', () => {
    it('flags a reused requirement id and passes unique ids', () => {
        expect(check_unique_ids(spec({ requirements: [req('AC-001', 'x'), req('AC-002', 'y')] }))).toEqual([]);
        const dup = check_unique_ids(spec({ requirements: [req('AC-001', 'x', 3), req('AC-001', 'y', 9)] }));
        expect(codes(dup)).toEqual(['C001']);
        expect(dup[0].line).toBe(9);
        expect(dup[0].message).toContain('line 3');
    });
});

describe('C003 verify-with', () => {
    it('passes when each requirement carries a Verify line (both forms) and flags when missing', () => {
        expect(check_verify_with(spec({ requirements: [req('AC-001', 'It must X.\nVerify with: a test')] }))).toEqual(
            []
        );
        expect(check_verify_with(spec({ requirements: [req('C-001', 'IT MUST X.\nVERIFY BY test')] }))).toEqual([]);
        const missing = check_verify_with(spec({ requirements: [req('AC-002', 'It must X with no check line.')] }));
        expect(codes(missing)).toEqual(['C003']);
    });
});

describe('C004 one-strength-word', () => {
    it('passes exactly one strength word and flags zero or two', () => {
        expect(check_one_strength_word(spec({ requirements: [req('AC-001', 'The tool must reject it.')] }))).toEqual(
            []
        );
        expect(
            codes(check_one_strength_word(spec({ requirements: [req('AC-002', 'The tool must not reject it.')] })))
        ).toEqual([]);
        expect(codes(check_one_strength_word(spec({ requirements: [req('AC-003', 'The tool rejects it.')] })))).toEqual(
            ['C004']
        );
        expect(
            codes(check_one_strength_word(spec({ requirements: [req('AC-004', 'It must X and should Y.')] })))
        ).toEqual(['C004']);
    });

    it('counts strength words only in the statement, not the Verify line', () => {
        // statement has one modal; the modal in the Verify line must not count → no C004
        expect(
            check_one_strength_word(
                spec({
                    requirements: [req('AC-1', 'The tool must reject it.\nVerify with: a test that should prove it.')],
                })
            )
        ).toEqual([]);
        // statement has zero modals (the only one is in the Verify line) → C004 fires
        expect(
            codes(
                check_one_strength_word(
                    spec({
                        requirements: [req('AC-2', 'The tool rejects it.\nVerify with: assert it must not throw.')],
                    })
                )
            )
        ).toEqual(['C004']);
    });
});

describe('C005 non-goals-present', () => {
    it('passes a non-empty Non-goals section and flags missing or empty', () => {
        expect(check_non_goals(spec())).toEqual([]);
        expect(codes(check_non_goals(spec({ sectionTitles: ['Open questions'] })))).toEqual(['C005']);
        expect(codes(check_non_goals(spec({ nonGoalsBody: '   ' })))).toEqual(['C005']);
    });
});

describe('C006 open-questions-present', () => {
    it('passes when present and flags when absent', () => {
        expect(check_open_questions(spec())).toEqual([]);
        expect(codes(check_open_questions(spec({ openQuestionsPresent: false })))).toEqual(['C006']);
    });
});

describe('C007 no-tbd-at-ready', () => {
    it('ignores markers at draft, flags them at ready, passes a clean ready spec', () => {
        expect(check_no_tbd_at_ready(spec({ frontmatter: { status: 'draft' }, bodyText: 'a TODO remains' }))).toEqual(
            []
        );
        expect(
            codes(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'a TODO remains' })))
        ).toEqual(['C007']);
        expect(
            codes(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'has ??? still' })))
        ).toEqual(['C007']);
        expect(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'all resolved' }))).toEqual([]);
    });
});

describe('C008 sources-named', () => {
    it('passes when sources are named and flags an empty list', () => {
        expect(check_sources_named(spec())).toEqual([]);
        expect(codes(check_sources_named(spec({ frontmatter: { sources: [] } })))).toEqual(['C008']);
    });
});

describe('C009 broken-source-link', () => {
    it('flags unresolved workspace refs, exempts trackers, passes resolved refs', () => {
        const present = check_broken_source_link({
            spec: spec({ frontmatter: { sources: ['specs/x/spec.md'] }, links: [{ raw: 'docs/y.md', line: 12 }] }),
            exists: () => true,
        });
        expect(present).toEqual([]);

        const missingFrontmatter = check_broken_source_link({
            spec: spec({ frontmatter: { sources: ['specs/gone.md', 'JIRA-9'] } }),
            exists: () => false,
        });
        expect(codes(missingFrontmatter)).toEqual(['C009']);
        expect(missingFrontmatter[0].line).toBeNull();

        const missingBodyLink = check_broken_source_link({
            spec: spec({ frontmatter: { sources: [] }, links: [{ raw: '../nope.md', line: 7 }] }),
            exists: () => false,
        });
        expect(missingBodyLink[0].line).toBe(7);
    });
});

describe('run_spec_checks + verdict_for', () => {
    it('a conformant spec yields no diagnostics and a clean verdict', () => {
        const conformant = spec({
            frontmatter: { status: 'ready', sources: ['ADR-0077'] },
            requirements: [req('AC-001', 'The tool must X.\nVerify with: a named test')],
        });
        const diagnostics = run_spec_checks({ spec: conformant, exists: () => true });
        expect(diagnostics).toEqual([]);
        expect(verdict_for(diagnostics)).toBe('clean');
    });

    it('aggregates a blocking verdict when any hard error fires', () => {
        const diagnostics = run_spec_checks({
            spec: spec({ requirements: [req('AC-001', 'The tool rejects it.')] }), // C003 (hard) + C004 (warn)
            exists: () => true,
        });
        expect(codes(diagnostics)).toEqual(expect.arrayContaining(['C003', 'C004']));
        expect(verdict_for(diagnostics)).toBe('blocking');
    });

    it('verdict_for returns warning when only warnings fire and clean when empty', () => {
        expect(verdict_for([{ code: 'C004', severity: 'warning', message: 'x', line: 1 }])).toBe('warning');
        expect(verdict_for([])).toBe('clean');
    });
});

describe('drift guard against the sibling swarm/checks/checks.yaml', () => {
    const contractPath = resolve(process.cwd(), '../swarm/checks/checks.yaml');
    const present = existsSync(contractPath);

    (present ? it : it.skip)('pins the same version and core-check table', () => {
        const text = readFileSync(contractPath, 'utf8');
        const version = text.match(/^version:\s*([0-9.]+)/m);
        expect(version?.[1]).toBe(CONTRACT_VERSION);
        for (const check of CORE_CHECKS) {
            const row = new RegExp(`id:\\s*${check.id},\\s*name:\\s*${check.name},\\s*severity:\\s*${check.severity}`);
            expect(text).toMatch(row);
        }
    });
});
