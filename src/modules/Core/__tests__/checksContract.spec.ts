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
    check_no_tbd_at_ready,
    check_sources_named,
    check_broken_source_link,
    check_citation_resolves,
    check_malformed_requirement_heading,
    check_coverage,
    coverage_facts,
    check_verify_binding,
    verify_binding_facts,
    check_supported_evidence,
    supported_rows_missing_evidence,
    normalize_cmd,
    type VerifyBindingInput,
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
            format: null,
            sources: ['ADR-0077'],
            ...frontmatter,
        },
        requirements: [],
        sectionTitles: ['Intent', 'Non-goals', 'Open questions'],
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
        expect(severity_of('C004')).toBe('warning');
        expect(severity_of('C007')).toBe('hard-error');
        expect(severity_of('C008')).toBe('warning');
        expect(severity_of('C009')).toBe('hard-error');
        expect(severity_of('C010')).toBe('hard-error');
        expect(severity_of('C011')).toBe('warning');
        expect(severity_of('C012')).toBe('warning');
        expect(severity_of('C013')).toBe('warning');
        expect(severity_of('C015')).toBe('warning');
        expect(severity_of('C016')).toBe('hard-error'); // an empty-Evidence Supported blocks
        expect(severity_of('C019')).toBe('warning');
        expect(severity_of('C020')).toBe('hard-error'); // a review tied to nothing blocks (ADR-0128)
        expect(severity_of('C021')).toBe('hard-error');
        expect(severity_of('C022')).toBe('hard-error');
        expect(severity_of('C023')).toBe('hard-error');
        expect(severity_of('C024')).toBe('hard-error');
    });
});

describe('C016 supported-needs-evidence (ADR-0097)', () => {
    const rows = [
        { id: 'AC-001', assessment: 'Supported', evidence: '' }, // empty Evidence on a Supported → C016
        { id: 'AC-002', assessment: 'Supported', evidence: 'pasted output' }, // backed → no finding
        { id: 'AC-003', assessment: 'Unverified', evidence: '' }, // empty but not Supported → no finding
        { id: 'AC-004', assessment: 'Supported', evidence: '   ' }, // whitespace-only → still empty → C016
    ];

    it('reports the Supported rows whose Evidence is empty (or whitespace-only), and only those', () => {
        expect(supported_rows_missing_evidence(rows)).toEqual(['AC-001', 'AC-004']);
    });

    it('emits a C016 hard-error diagnostic per empty-evidence Supported row', () => {
        const diagnostics = check_supported_evidence(rows);
        expect(diagnostics.map((d) => d.code)).toEqual(['C016', 'C016']);
        expect(diagnostics.every((d) => d.severity === 'hard-error')).toBe(true);
        expect(diagnostics[0].message).toContain('AC-001');
    });

    it('a fully-filled coverage table yields no C016 (0-FP)', () => {
        expect(check_supported_evidence([{ id: 'AC-001', assessment: 'Supported', evidence: 'a CI link' }])).toEqual(
            []
        );
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
        expect(diagnostics[0].message).toBe('coverage row AC-009 names an id absent from the source spec (orphan)');
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

describe('normalize_cmd (ADR-0083)', () => {
    const bare = 'npm test -- auth-refresh.spec.ts';
    it('reduces the canon Verify-with forms (backtick-wrapped, trailing note, extra whitespace) to the same bare command', () => {
        expect(normalize_cmd(`\`${bare}\``)).toBe(bare);
        expect(normalize_cmd(`\`${bare}\` (the refresh path)`)).toBe(bare);
        expect(normalize_cmd('npm test  --  auth-refresh.spec.ts')).toBe(bare);
        expect(normalize_cmd(bare)).toBe(bare);
    });
    it('keeps genuinely different commands distinct', () => {
        expect(normalize_cmd('`npm test -- a`')).not.toBe(normalize_cmd('`npm test -- b`'));
    });
    it('strips a trailing em/en-dash note clause but never an ASCII `--` flag', () => {
        // The em-dash note form (`cmd` — note) must reduce to the same bare command as the parenthetical
        // form, so switching note delimiters does not flip every coverage row to a C013 cmd-mismatch...
        expect(normalize_cmd(`\`${bare}\` — the refresh path`)).toBe(bare);
        expect(normalize_cmd(`\`${bare}\` – en-dash note`)).toBe(bare);
        // ...while a real `--` flag (ASCII double hyphen) is NEVER treated as a note and is preserved.
        expect(normalize_cmd('`npm test -- auth-refresh.spec.ts`')).toBe(bare);
    });
});

describe('C013 verify-evidence-binding (ADR-0083, AC-005)', () => {
    const base = (over: Partial<VerifyBindingInput> = {}): VerifyBindingInput => ({
        sourceSpecStatus: 'ready',
        namedCommandById: new Map([['AC-001', 'npm test -- auth-refresh.spec.ts']]),
        coverageRows: [{ id: 'AC-001', assessment: 'Supported' }],
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

    it('a backtick-wrapped named command matches a bare block', () => {
        expect(
            verify_binding_facts(
                base({
                    namedCommandById: new Map([['AC-001', '`npm test -- auth-refresh.spec.ts`']]),
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
                    ],
                })
            )
        ).toEqual([]);
    });

    it('a named command with a trailing parenthetical note matches a bare block', () => {
        expect(
            verify_binding_facts(
                base({
                    namedCommandById: new Map([['AC-001', '`npm test -- auth-refresh.spec.ts` (the refresh path)']]),
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
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
        // The reconcile face (verify_binding_facts) is unchanged — a plain fact, no severity, advisory.
        expect(facts).toEqual([{ id: 'AC-001', kind: 'cmd-mismatch' }]);
        // The gate wrapper (check_verify_binding) promotes a cmd-mismatch to hard-error (#95, ADR-0129).
        expect(
            check_verify_binding(
                base({
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- other.spec.ts', result: 'pass', malformed: false },
                    ],
                })
            )
        ).toEqual([
            {
                code: 'C013',
                severity: 'hard-error',
                message:
                    "coverage row AC-001's verify block records a cmd that does not match the requirement's named Verify command",
                line: null,
            },
        ]);
    });

    it('a result=fail under a Supported row → a result-fail fact, rendered at warning with its own message', () => {
        expect(
            verify_binding_facts(
                base({
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'fail', malformed: false },
                    ],
                })
            )
        ).toEqual([{ id: 'AC-001', kind: 'result-fail' }]);
        // The gate wrapper keeps result-fail advisory (warning) — only cmd-mismatch escalates.
        expect(
            check_verify_binding(
                base({
                    verifyBlocks: [
                        { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'fail', malformed: false },
                    ],
                })
            )
        ).toEqual([
            {
                code: 'C013',
                severity: 'warning',
                message: 'coverage row AC-001 is Supported but its verify block records result=fail',
                line: null,
            },
        ]);
    });

    it('a malformed block under a Supported row → a malformed fact', () => {
        expect(
            verify_binding_facts(base({ verifyBlocks: [{ id: 'AC-001', cmd: null, result: 'pass', malformed: true }] }))
        ).toEqual([{ id: 'AC-001', kind: 'malformed' }]);
    });

    it('a keyed malformed block on a NON-Supported row is still surfaced, not dropped (#32, AC-004)', () => {
        expect(
            verify_binding_facts(
                base({
                    coverageRows: [{ id: 'AC-001', assessment: 'Unsupported' }],
                    verifyBlocks: [{ id: 'AC-001', cmd: null, result: null, malformed: true }],
                })
            )
        ).toEqual([{ id: 'AC-001', kind: 'malformed' }]);
    });

    it('an unkeyed (id-less) malformed block is surfaced on its own', () => {
        expect(
            verify_binding_facts(base({ verifyBlocks: [{ id: null, cmd: 'x', result: 'pass', malformed: true }] }))
        ).toEqual([
            { id: '(unkeyed)', kind: 'malformed' },
            // the Supported row still has no block → free-form-only
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

    it('the gate wrapper renders the duplicate and malformed kinds at warning severity with their own messages', () => {
        // Two blocks keyed to AC-001, the second malformed: one duplicate fact + one malformed fact;
        // the first block backs the Supported row consistently, so nothing else fires. Pins the
        // verify_binding_message branches the cmd-mismatch case above never reaches.
        const diagnostics = check_verify_binding(
            base({
                verifyBlocks: [
                    { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
                    { id: 'AC-001', cmd: null, result: null, malformed: true },
                ],
            })
        );
        expect(diagnostics).toEqual([
            {
                code: 'C013',
                severity: 'warning',
                message: 'requirement AC-001 carries more than one verify block',
                line: null,
            },
            {
                code: 'C013',
                severity: 'warning',
                message:
                    'coverage row AC-001 carries a malformed verify block (its info-string did not parse to id / cmd / result)',
                line: null,
            },
        ]);
    });

    it('a Supported row with no verify block (free-form cell only) → a free-form-only warning', () => {
        expect(verify_binding_facts(base({ verifyBlocks: [] }))).toEqual([{ id: 'AC-001', kind: 'free-form-only' }]);
        // The gate wrapper renders it advisory, spelling out how to silence it (R5-I11).
        expect(check_verify_binding(base({ verifyBlocks: [] }))).toEqual([
            {
                code: 'C013',
                severity: 'warning',
                message:
                    'coverage row AC-001 is Supported with only a free-form Evidence cell (advisory — add a `verify` block to machine-confirm, or leave as-is to route to a human)',
                line: null,
            },
        ]);
    });

    it('a non-Supported row is not subject to the free-form-only warning', () => {
        expect(
            verify_binding_facts(base({ coverageRows: [{ id: 'AC-001', assessment: 'Unverified' }], verifyBlocks: [] }))
        ).toEqual([]);
    });

    it('a draft source spec is exempt (the scope guard) — no C013 at all', () => {
        expect(
            verify_binding_facts(
                base({
                    sourceSpecStatus: 'draft',
                    coverageRows: [{ id: 'AC-001', assessment: 'Supported' }],
                    verifyBlocks: [{ id: 'AC-001', cmd: 'wrong', result: 'fail', malformed: false }],
                })
            )
        ).toEqual([]);
    });

    it('a Supported row whose requirement names no command cannot match a recorded cmd → cmd-mismatch', () => {
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
    it('passes when each requirement carries a Verify line (both forms) and flags when missing', () => {
        expect(check_verify_with(spec({ requirements: [req('AC-001', 'It must X.\nVerify with: a test')] }))).toEqual(
            []
        );
        expect(check_verify_with(spec({ requirements: [req('C-001', 'IT MUST X.\nVERIFY BY test')] }))).toEqual([]);
        const missing = check_verify_with(spec({ requirements: [req('AC-002', 'It must X with no check line.')] }));
        expect(codes(missing)).toEqual(['C003']);
        const empty = check_verify_with(spec({ requirements: [req('AC-003', 'It must X.\nVerify with:   ')] }));
        expect(codes(empty)).toEqual(['C003']);
        expect(empty[0].message).toContain('non-empty');
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
        const zero = check_one_strength_word(spec({ requirements: [req('AC-003', 'The tool rejects it.')] }));
        expect(codes(zero)).toEqual(['C004']);
        expect(zero[0].message).toBe(
            'requirement AC-003 states no strength word — it binds on nothing; add the one word (MUST/SHOULD/…) it binds on'
        );
        const two = check_one_strength_word(spec({ requirements: [req('AC-004', 'It must X and should Y.')] }));
        expect(codes(two)).toEqual(['C004']);
        expect(two[0].message).toBe(
            'requirement AC-004 states 2 strength words — several bindings often mean several requirements; consider a split (advice, not a format bar)'
        );
    });

    it('exempts SOL INTERFACE (IF-) blocks — a declaration has no strength-word slot (ADR-0127, #96)', () => {
        // An INTERFACE with no strength word must NOT fire C004 (it binds on nothing by grammar)…
        expect(
            check_one_strength_word(spec({ requirements: [req('IF-001', '`refreshSession` RETURNS `Session`')] }))
        ).toEqual([]);
        // …while a REQ/CONSTRAINT/INVARIANT with no strength word still does.
        expect(codes(check_one_strength_word(spec({ requirements: [req('I-001', 'A token is unique.')] })))).toEqual([
            'C004',
        ]);
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

    it('ignores strength words quoted in inline code — they are mentions, not stated modals (#31)', () => {
        // the only "should" is inside a backticked flag name → it counts as zero, so C004 fires
        const quotedOnly = check_one_strength_word(
            spec({ requirements: [req('AC-1', 'The flag is a `--should-skip` option.')] })
        );
        expect(codes(quotedOnly)).toEqual(['C004']);
        expect(quotedOnly[0].message).toContain('states no strength word');
        // one real modal plus a "must" quoted in an error string → still exactly one, no C004
        expect(
            check_one_strength_word(
                spec({
                    requirements: [
                        req('AC-2', 'The validator must reject the error string `input must be non-empty`.'),
                    ],
                })
            )
        ).toEqual([]);
    });

    it('counts strength words only in the SOL RESPONSE clause, not the WHEN/IF trigger condition (R5-I02)', () => {
        const sol = (id: string, body: string) =>
            spec({ frontmatter: { format: 'sol' }, requirements: [req(id, body)] });
        // A conditional modal in the trigger ("WHEN a request may be retried") is condition prose, not a
        // second obligation — only the response clause's strength word binds (for a format: sol spec).
        expect(
            check_one_strength_word(sol('AC-001', 'WHEN a request may be retried THE service MUST be idempotent'))
        ).toEqual([]);
        // a GENUINE bundle in the SOL response (two THE…MUST clauses) is still flagged
        expect(
            codes(check_one_strength_word(sol('AC-002', 'THE service MUST log AND THE service MUST alert')))
        ).toEqual(['C004']);
        // a SOL trigger with NO response strength word still fails (zero in the response)
        expect(codes(check_one_strength_word(sol('AC-003', 'WHEN x may happen THE service responds')))).toEqual([
            'C004',
        ]);
        // the gate is by-construction: the SAME shape in a PLAIN (non-sol) spec is counted in full, so the
        // trigger modal still flags — `response_clause` never narrows a non-sol spec.
        expect(
            codes(
                check_one_strength_word(
                    spec({
                        requirements: [req('AC-004', 'WHEN a request may be retried THE service MUST be idempotent')],
                    })
                )
            )
        ).toEqual(['C004']);
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

    it('flags an unresolved blocking open question at ready, on both record surfaces (the "or blocking open question" clause; payment-5xx fixture)', () => {
        const plain = check_no_tbd_at_ready(
            spec({
                frontmatter: { status: 'ready' },
                bodyText: '- Blocking: is the charge endpoint idempotent across retries?',
            })
        );
        expect(codes(plain)).toEqual(['C007']);
        expect(plain[0].message).toContain('blocking open question');
        expect(
            codes(
                check_no_tbd_at_ready(
                    spec({
                        frontmatter: { status: 'ready' },
                        bodyText: 'QUESTION Q-001 [blocking]:\nIs the charge endpoint idempotent?',
                    })
                )
            )
        ).toEqual(['C007']);
    });

    it('a blocking question at draft, or a question downgraded to non-blocking at ready, does not fire', () => {
        expect(
            check_no_tbd_at_ready(spec({ frontmatter: { status: 'draft' }, bodyText: '- Blocking: still open' }))
        ).toEqual([]);
        expect(
            check_no_tbd_at_ready(
                spec({
                    frontmatter: { status: 'ready' },
                    bodyText: 'QUESTION Q-001 [non-blocking]:\nNice-to-have, answer later.',
                })
            )
        ).toEqual([]);
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
            requirements: [req('AC-001', 'The tool must X.\nVerify with: a named test')],
        });
        const diagnostics = run_spec_checks({ spec: conformant, exists: () => true });
        expect(diagnostics).toEqual([]);
        expect(level_for(diagnostics)).toBe('clean');
    });

    it('aggregates a blocking level when any hard error fires', () => {
        const diagnostics = run_spec_checks({
            spec: spec({ requirements: [req('AC-001', 'The tool rejects it.')] }), // C003 (hard) + C004 (warn)
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
                        req('AC-001', 'The tool must X.\nVerify with: a test', 3),
                        req('AC-001', 'The tool must Y.\nVerify with: a test', 9),
                    ],
                }),
                exists: () => true,
            },
        },
        {
            code: 'C003',
            input: {
                spec: spec({ requirements: [req('AC-001', 'The tool must X with no check line.')] }),
                exists: () => true,
            },
        },
        {
            code: 'C004',
            input: {
                spec: spec({ requirements: [req('AC-001', 'The tool rejects it.\nVerify with: a test')] }),
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
    ])('$code stays wired: a spec violating only that rule surfaces it through run_spec_checks', ({ code, input }) => {
        expect(codes(run_spec_checks(input))).toEqual([code]);
    });

    it('level_for returns warning when only warnings fire and clean when empty', () => {
        expect(level_for([{ code: 'C004', severity: 'warning', message: 'x', line: 1 }])).toBe('warning');
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
            'checked: [spec, task, review, change-plan]',
            'recognized_unchecked: [inventory, audit, research, inspection]',
            'missing_type: hard-error',
            'unknown_type: hard-error',
            'status_enum: [draft, ready]',
            'format_enum: [sol]',
            'status_enum: [ready, running, review-ready, closed]',
            'source_spec_status: ready',
            'decision_enum: [pending, accepted, changes-requested, deferred]',
            'sections: [Requirement coverage, Change-plan coverage]',
            'columns: [ID, Assessment, Evidence]',
            'delimiter_row: required-immediately-after-header',
            'rows: contiguous',
            'assessment_enum: [Supported, Unsupported, Unverified, Blocked]',
            '^(all )?(tests?|checks?) (pass(ed)?|succeeded)\\.?$',
            'C005 and C006 are RETIRED',
            'C014 is RETIRED',
            'C017 is RETIRED',
            'C018 is RESERVED',
        ]) {
            expect(text).toContain(contractLine);
        }
    });
});

describe('coverage_facts — uncovered dedup (#32)', () => {
    it('a scope list naming the same in-scope id twice surfaces one uncovered finding', () => {
        expect(
            coverage_facts({
                sourceSpecStatus: 'ready',
                inScopeIds: ['AC-001', 'AC-001', 'AC-002'],
                specRequirementIds: ['AC-002'],
                coverageRowIds: [],
            })
        ).toEqual([
            { id: 'AC-001', kind: 'uncovered' },
            { id: 'AC-002', kind: 'uncovered' },
        ]);
    });
});
