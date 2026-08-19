import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolve_canon_root } from '../testing/resolveCanonRoot.ts';

import {
    CONTRACT_VERSION,
    CORE_CHECKS,
    severity_of,
    is_path_ref,
    check_unique_ids,
    check_verify_with,
    check_one_strength_word,
    check_requirement_shape,
    check_no_tbd_at_ready,
    check_sources_named,
    check_broken_source_link,
    check_citation_resolves,
    check_malformed_requirement_heading,
    check_spec_shape,
    check_preserves_refs_resolve,
    check_waves_present,
    run_spec_checks,
    level_for,
    type RunSpecChecksInput,
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
            sources: ['ADR-0077'],
            ...frontmatter,
        },
        requirements: [
            {
                id: 'AC-001',
                line: 1,
                body: '- When: always\n- Then: the tool MUST work\n- Verify with: a test',
            },
        ],
        sectionTitles: ['Intent', 'Requirements', 'Non-goals', 'Open questions'],
        intentBody: 'purpose',
        nonGoalsBody: 'what this does not change',
        openQuestionsPresent: true,
        bodyText: '',
        links: [],
        citations: [],
        malformedRequirementHeadings: [],
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
        expect(severity_of('C002')).toBe('hard-error'); // a cross-file id collision blocks
        expect(severity_of('C003')).toBe('hard-error');
        expect(severity_of('C004')).toBe('hard-error');
        expect(severity_of('C007')).toBe('hard-error');
        expect(severity_of('C008')).toBe('warning');
        expect(severity_of('C009')).toBe('hard-error');
        expect(severity_of('C010')).toBe('hard-error');
        expect(severity_of('C011')).toBe('warning');
        expect(severity_of('C015')).toBe('warning');
        expect(severity_of('C019')).toBe('warning');
        expect(severity_of('C021')).toBe('hard-error');
        expect(severity_of('C022')).toBe('hard-error');
        expect(severity_of('C023')).toBe('hard-error');
        expect(severity_of('C024')).toBe('hard-error');
        expect(severity_of('C025')).toBe('hard-error');
        expect(severity_of('C028')).toBe('hard-error');
        expect(severity_of('C029')).toBe('hard-error');
        expect(severity_of('C030')).toBe('hard-error');
        expect(severity_of('C031')).toBe('hard-error');
    });
});

describe('C025 spec-shape', () => {
    it('blocks missing identity, status, sections, and requirements in one diagnostic', () => {
        const diagnostics = check_spec_shape(
            spec({
                frontmatter: { id: null, status: null },
                sectionTitles: [],
                requirements: [],
            })
        );
        expect(codes(diagnostics)).toEqual(['C025']);
        expect(diagnostics[0].message).toContain('`id:` must be a non-empty scalar');
        expect(diagnostics[0].message).toContain('missing `## Requirements`');
    });

    it('accepts the minimal valid spec shape', () => {
        expect(check_spec_shape(spec())).toEqual([]);
    });
});

describe('C015 citation-resolves (ADR-0087)', () => {
    it('flags a dangling citation — a key the resolver rejects → one C015 warning', () => {
        const diagnostics = check_citation_resolves(spec({ citations: ['FAROS2025'] }), (key) => key !== 'FAROS2025');
        expect(codes(diagnostics)).toEqual(['C015']);
        expect(diagnostics[0].severity).toBe('warning');
        expect(diagnostics[0].message).toBe('citation [[FAROS2025]] resolves to no `<a id>` anchor in sources.md');
    });

    it('a resolving citation → no finding', () => {
        expect(check_citation_resolves(spec({ citations: ['SMELLS'] }), (key) => key === 'SMELLS')).toEqual([]);
    });

    it('surfaces only the dangling keys when some resolve and some do not', () => {
        const resolves = new Set(['GOOGLESA', 'MAST']);
        const diagnostics = check_citation_resolves(spec({ citations: ['GOOGLESA', 'MAST', 'FAROS2025'] }), (key) =>
            resolves.has(key)
        );
        expect(codes(diagnostics)).toEqual(['C015']);
        expect(diagnostics[0].message).toContain('FAROS2025');
    });

    it('no citations → no finding', () => {
        expect(check_citation_resolves(spec({ citations: [] }), () => false)).toEqual([]);
    });

    it('the admit-every-key resolver (the skip-when-nothing-to-check default) never fires', () => {
        expect(check_citation_resolves(spec({ citations: ['ANYTHING', 'ELSE'] }), () => true)).toEqual([]);
    });
});

describe('C019 malformed-requirement-heading', () => {
    it('warns per letter-suffixed id-shaped heading, citing the heading and its line', () => {
        const diagnostics = check_malformed_requirement_heading(
            spec({
                malformedRequirementHeadings: [
                    { heading: 'AC-004a', line: 12 },
                    { heading: 'AC-009b', line: 30 },
                ],
            })
        );
        expect(codes(diagnostics)).toEqual(['C019', 'C019']);
        expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
        expect(diagnostics[0].message).toContain('AC-004a');
        expect(diagnostics[0].line).toBe(12);
    });

    it('a spec with none → no finding', () => {
        expect(check_malformed_requirement_heading(spec())).toEqual([]);
    });

    it('surfaces through run_spec_checks, so unwiring the rule cannot pass silently', () => {
        const diagnostics = run_spec_checks({
            spec: spec({
                malformedRequirementHeadings: [{ heading: 'AC-004a', line: 12 }],
            }),
            exists: () => true,
        });
        expect(diagnostics.filter((d) => d.code === 'C019')).toHaveLength(1);
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

describe('is_path_ref', () => {
    it('treats paths and doc-like files as resolvable refs', () => {
        expect(is_path_ref('specs/x/spec.md')).toBe(true);
        expect(is_path_ref('../suspec/checks/checks.yaml')).toBe(true);
        expect(is_path_ref('file.md')).toBe(true);
        expect(is_path_ref('config.json')).toBe(true);
    });

    it('exempts bare tracker ids, urls, prose tokens, and bare cross-refs', () => {
        expect(is_path_ref('JIRA-123')).toBe(false);
        expect(is_path_ref('ADR-0077')).toBe(false);
        expect(is_path_ref('https://example.com')).toBe(false);
        expect(is_path_ref('http://example.com')).toBe(false);
        expect(is_path_ref('mailto:a@b.c')).toBe(false);
        expect(is_path_ref('plainword')).toBe(false);
        expect(is_path_ref('e.g.')).toBe(false);
        expect(is_path_ref('#a-heading')).toBe(false);
        expect(is_path_ref('   ')).toBe(false);
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
    it('passes when each requirement carries a Verify line and flags when missing', () => {
        expect(check_verify_with(spec({ requirements: [req('AC-001', '- Verify with: a test')] }))).toEqual([]);
        const missing = check_verify_with(spec({ requirements: [req('AC-002', '- Then: it MUST X')] }));
        expect(codes(missing)).toEqual(['C003']);
        const empty = check_verify_with(spec({ requirements: [req('AC-003', '- Verify with:   ')] }));
        expect(codes(empty)).toEqual(['C003']);
        expect(empty[0].message).toContain('non-empty');
    });
});

describe('C004 one-strength-word', () => {
    it('passes exactly one strength word and flags zero or two', () => {
        expect(
            check_one_strength_word(spec({ requirements: [req('AC-001', '- Then: the tool MUST reject it')] }))
        ).toEqual([]);
        expect(
            codes(
                check_one_strength_word(spec({ requirements: [req('AC-002', '- Then: the tool MUST NOT reject it')] }))
            )
        ).toEqual([]);
        const zero = check_one_strength_word(spec({ requirements: [req('AC-003', '- Then: the tool rejects it')] }));
        expect(codes(zero)).toEqual(['C004']);
        expect(zero[0].message).toBe(
            'requirement AC-003 `Then` must state exactly one strength word (MUST/MUST NOT/SHOULD/SHOULD NOT/MAY); found 0'
        );
        const two = check_one_strength_word(spec({ requirements: [req('AC-004', '- Then: it MUST X and SHOULD Y')] }));
        expect(codes(two)).toEqual(['C004']);
        expect(two[0].message).toBe(
            'requirement AC-004 `Then` must state exactly one strength word (MUST/MUST NOT/SHOULD/SHOULD NOT/MAY); found 2'
        );
        expect(
            codes(check_one_strength_word(spec({ requirements: [req('AC-005', '- Then: the tool must reject it')] })))
        ).toEqual(['C004']);
    });

    it('counts strength words only in the statement, not the Verify line', () => {
        // statement has one modal; the modal in the Verify line must not count → no C004
        expect(
            check_one_strength_word(
                spec({
                    requirements: [
                        req('AC-1', '- Then: the tool MUST reject it\n- Verify with: a test that should prove it'),
                    ],
                })
            )
        ).toEqual([]);
        // statement has zero modals (the only one is in the Verify line) → C004 fires
        expect(
            codes(
                check_one_strength_word(
                    spec({
                        requirements: [
                            req('AC-2', '- Then: the tool rejects it\n- Verify with: assert it must not throw'),
                        ],
                    })
                )
            )
        ).toEqual(['C004']);
    });

    it('ignores strength words quoted in inline code — they are mentions, not stated modals (#31)', () => {
        // the only "should" is inside a backticked flag name → it counts as zero, so C004 fires
        const quotedOnly = check_one_strength_word(
            spec({ requirements: [req('AC-1', '- Then: the flag is a `--should-skip` option')] })
        );
        expect(codes(quotedOnly)).toEqual(['C004']);
        expect(quotedOnly[0].message).toContain('found 0');
        // one real modal plus a "must" quoted in an error string → still exactly one, no C004
        expect(
            check_one_strength_word(
                spec({
                    requirements: [
                        req('AC-2', '- Then: the validator MUST reject the error string `input must be non-empty`'),
                    ],
                })
            )
        ).toEqual([]);
    });
});

describe('C007 no-tbd-at-ready', () => {
    it('ignores markers at draft, flags them at ready, passes a clean ready spec', () => {
        expect(check_no_tbd_at_ready(spec({ frontmatter: { status: 'draft' }, bodyText: 'a TODO remains' }))).toEqual(
            []
        );
        const marker = check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'a TODO remains' }));
        expect(codes(marker)).toEqual(['C007']);
        expect(marker[0].message).toBe('a TBD / TODO / ??? marker remains at status: ready');
        expect(
            codes(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'has ??? still' })))
        ).toEqual(['C007']);
        expect(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'all resolved' }))).toEqual([]);
    });

    it('flags an unresolved blocking open question at ready', () => {
        const plain = check_no_tbd_at_ready(
            spec({
                frontmatter: { status: 'ready' },
                bodyText: '- Blocking: is the charge endpoint idempotent across retries?',
            })
        );
        expect(codes(plain)).toEqual(['C007']);
        expect(plain[0].message).toContain('blocking open question');
    });

    it('a blocking question at draft does not fire', () => {
        expect(
            check_no_tbd_at_ready(spec({ frontmatter: { status: 'draft' }, bodyText: '- Blocking: still open' }))
        ).toEqual([]);
    });
});

describe('C028 requirement-shape', () => {
    it('accepts the canonical three-item block', () => {
        expect(
            check_requirement_shape(
                spec({
                    requirements: [
                        req(
                            'AC-001',
                            '- When: input is empty\n- Then: the parser MUST reject it\n- Verify with: a test'
                        ),
                    ],
                })
            )
        ).toEqual([]);
    });

    it.each([
        ['missing condition', '- Then: the parser MUST reject it\n- Verify with: a test'],
        ['empty condition', '- When:   \n- Then: the parser MUST reject it\n- Verify with: a test'],
        ['misordered fields', '- Then: the parser MUST reject it\n- When: input is empty\n- Verify with: a test'],
        ['escaped prose', '- When: input is empty\n- Then: the parser MUST reject it\nextra\n- Verify with: a test'],
        [
            'duplicate field',
            '- When: input is empty\n- When: input is blank\n- Then: the parser MUST reject it\n- Verify with: a test',
        ],
    ])('blocks %s', (_name, body) => {
        const diagnostics = check_requirement_shape(spec({ requirements: [req('AC-001', body)] }));
        expect(codes(diagnostics)).toEqual(['C028']);
        expect(diagnostics[0].severity).toBe('hard-error');
    });
});

describe('C008 sources-named', () => {
    it('passes when sources are named and flags an empty list', () => {
        expect(check_sources_named(spec())).toEqual([]);
        expect(codes(check_sources_named(spec({ frontmatter: { sources: [] } })))).toEqual(['C008']);
    });
});

describe('C009 broken-source-link', () => {
    it('flags unresolved path refs, exempts trackers, passes resolved refs', () => {
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

describe('run_spec_checks + level_for', () => {
    it('a conformant spec yields no diagnostics and a clean level', () => {
        const conformant = spec({
            frontmatter: { status: 'ready', sources: ['ADR-0077'] },
            requirements: [req('AC-001', '- When: always\n- Then: the tool MUST X\n- Verify with: a named test')],
        });
        const diagnostics = run_spec_checks({ spec: conformant, exists: () => true });
        expect(diagnostics).toEqual([]);
        expect(level_for(diagnostics)).toBe('clean');
    });

    it('aggregates a blocking level when any hard error fires', () => {
        const diagnostics = run_spec_checks({
            spec: spec({
                requirements: [req('AC-001', '- When: always\n- Then: the tool rejects it\n- Verify with:')],
            }),
            exists: () => true,
        });
        expect(codes(diagnostics)).toEqual(expect.arrayContaining(['C003', 'C004']));
        expect(level_for(diagnostics)).toBe('blocking');
    });

    // Wiring guard, generalized from C019's case: for every check run_spec_checks claims to run, a
    // spec violating only that rule surfaces exactly its code — dropping any one `...check_x(...)`
    // line from the aggregator fails the matching row here, not just C019's.
    it.each<{ code: string; input: RunSpecChecksInput }>([
        {
            code: 'C001',
            input: {
                spec: spec({
                    requirements: [
                        req('AC-001', '- When: always\n- Then: the tool MUST X\n- Verify with: a test', 3),
                        req('AC-001', '- When: always\n- Then: the tool MUST Y\n- Verify with: a test', 9),
                    ],
                }),
                exists: () => true,
            },
        },
        {
            code: 'C003',
            input: {
                spec: spec({
                    requirements: [req('AC-001', '- When: always\n- Then: the tool MUST X\n- Verify with:')],
                }),
                exists: () => true,
            },
        },
        {
            code: 'C004',
            input: {
                spec: spec({
                    requirements: [req('AC-001', '- When: always\n- Then: the tool rejects it\n- Verify with: a test')],
                }),
                exists: () => true,
            },
        },
        {
            code: 'C007',
            input: { spec: spec({ frontmatter: { status: 'ready' }, bodyText: 'a TODO remains' }), exists: () => true },
        },
        { code: 'C008', input: { spec: spec({ frontmatter: { sources: [] } }), exists: () => true } },
        {
            code: 'C009',
            input: { spec: spec({ frontmatter: { sources: ['specs/gone.md'] } }), exists: () => false },
        },
        {
            code: 'C015',
            input: { spec: spec({ citations: ['FAROS2025'] }), exists: () => true, anchor_resolves: () => false },
        },
        {
            code: 'C019',
            input: {
                spec: spec({ malformedRequirementHeadings: [{ heading: 'AC-004a', line: 12 }] }),
                exists: () => true,
            },
        },
        {
            code: 'C028',
            input: {
                spec: spec({
                    requirements: [req('AC-001', '- Then: the tool MUST work\n- When: always\n- Verify with: a test')],
                }),
                exists: () => true,
            },
        },
    ])('$code stays wired: a spec violating only that rule surfaces it through run_spec_checks', ({ code, input }) => {
        expect(codes(run_spec_checks(input))).toEqual([code]);
    });

    it('level_for returns warning when only warnings fire and clean when empty', () => {
        expect(level_for([{ code: 'C008', severity: 'warning', message: 'x', line: 1 }])).toBe('warning');
        expect(level_for([])).toBe('clean');
    });
});

describe('drift guard against the sibling suspec/checks/checks.yaml', () => {
    // PG-005's drift-guard teeth are conditional on a sibling suspec canon checkout being present: in a
    // hermetic suspec-cli-only checkout the contract source isn't on disk, so the guard CANNOT run and
    // no-ops (SKIPPED below, never silently green). The canon resolves via SUSPEC_CANON, `../suspec`,
    // or any canon-shaped sibling (checks/checks.yaml + docs/adrs). We deliberately do NOT vendor a
    // checks.yaml copy here: a second source of truth would itself drift from the canon it is meant to
    // pin. The named, warned skip makes an absent sibling visible instead of silently passing.
    const canonRoot = resolve_canon_root(process.cwd());
    const contractPath = canonRoot === null ? '' : resolve(canonRoot, 'checks/checks.yaml');
    const present = contractPath !== '' && existsSync(contractPath);
    if (!present) {
        console.warn(
            `[no-op] drift guard SKIPPED: no sibling suspec canon found (SUSPEC_CANON / ../suspec / canon-shaped sibling) — provide one for PG-005 to bite`
        );
    }
    const guardName = present
        ? 'pins the machine-owned artifact, option, and check contract'
        : 'pins the machine-owned artifact, option, and check contract (SKIPPED: no sibling suspec canon)';

    (present ? it : it.skip)(guardName, () => {
        const text = readFileSync(contractPath, 'utf8');
        const version = text.match(/^version:\s*([0-9.]+)/m);
        expect(version?.[1]).toBe(CONTRACT_VERSION);
        for (const check of CORE_CHECKS) {
            const row = new RegExp(`id:\\s*${check.id},\\s*name:\\s*${check.name},\\s*severity:\\s*${check.severity}`);
            expect(text).toMatch(row);
        }
        // Reverse direction: a check minted in the canon with no counterpart here must also fail
        // the guard — otherwise a new core_checks row (e.g. a future C021) drifts past silently.
        const coreChecksBlock = text.match(/^core_checks:\n([\s\S]*?)(?=^\S|$(?![\r\n]))/m)?.[1] ?? '';
        const canonIds = [...coreChecksBlock.matchAll(/\bid:\s*(C\d+)/g)].map((m) => m[1]);
        expect([...canonIds].sort()).toEqual(CORE_CHECKS.map((c) => c.id).sort());
        for (const contractLine of [
            'checked: [spec, task, change-plan, campaign]',
            'recognized_unchecked: [inventory, audit, research, panel]',
            'missing_type: hard-error',
            'unknown_type: hard-error',
            'status_enum: [draft, ready]',
            'status_enum: [ready, running, review-ready, closed]',
            '^(all )?(tests?|checks?) (pass(ed)?|succeeded)\\.?$',
            'C005 and C006 are RESERVED',
            'C012 is RESERVED',
            'C013 is RESERVED',
            'C014 is RESERVED',
            'C016 is RESERVED',
            'C017 is RESERVED',
            'C018 is RESERVED',
            'C020 is RESERVED',
            'C026 is RESERVED',
            'C027 is RESERVED',
        ]) {
            expect(text).toContain(contractLine);
        }
    });
});
