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
    run_spec_checks,
    verdict_for,
    type ParsedSpec,
    type Requirement,
    type SpecFrontmatter,
    type Diagnostic,
} from '../services/checksContract.ts';

function spec(
    overrides: Partial<Omit<ParsedSpec, 'frontmatter'>> & { frontmatter?: Partial<SpecFrontmatter> } = {}
): ParsedSpec {
    const { frontmatter, ...rest } = overrides;
    return {
        frontmatter: { type: 'spec', id: 'SPEC-x', status: 'draft', format: null, sources: ['ADR-0077'], ...frontmatter },
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
        expect(severity_of('C011')).toBe('warning');
    });
});

describe('is_workspace_ref', () => {
    it('treats paths, dotted files, and anchors as workspace refs', () => {
        expect(is_workspace_ref('specs/x/spec.md')).toBe(true);
        expect(is_workspace_ref('../swarm/checks/checks.yaml')).toBe(true);
        expect(is_workspace_ref('file.md')).toBe(true);
        expect(is_workspace_ref('#a-heading')).toBe(true);
    });

    it('exempts bare tracker ids, urls, and plain words', () => {
        expect(is_workspace_ref('JIRA-123')).toBe(false);
        expect(is_workspace_ref('ADR-0077')).toBe(false);
        expect(is_workspace_ref('https://example.com')).toBe(false);
        expect(is_workspace_ref('http://example.com')).toBe(false);
        expect(is_workspace_ref('mailto:a@b.c')).toBe(false);
        expect(is_workspace_ref('plainword')).toBe(false);
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
        expect(check_verify_with(spec({ requirements: [req('AC-001', 'It must X.\nVerify with: a test')] }))).toEqual([]);
        expect(check_verify_with(spec({ requirements: [req('C-001', 'IT MUST X.\nVERIFY BY test')] }))).toEqual([]);
        const missing = check_verify_with(spec({ requirements: [req('AC-002', 'It must X with no check line.')] }));
        expect(codes(missing)).toEqual(['C003']);
    });
});

describe('C004 one-strength-word', () => {
    it('passes exactly one strength word and flags zero or two', () => {
        expect(check_one_strength_word(spec({ requirements: [req('AC-001', 'The tool must reject it.')] }))).toEqual([]);
        expect(codes(check_one_strength_word(spec({ requirements: [req('AC-002', 'The tool must not reject it.')] })))).toEqual([]);
        expect(codes(check_one_strength_word(spec({ requirements: [req('AC-003', 'The tool rejects it.')] })))).toEqual(['C004']);
        expect(codes(check_one_strength_word(spec({ requirements: [req('AC-004', 'It must X and should Y.')] })))).toEqual(['C004']);
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
        expect(check_no_tbd_at_ready(spec({ frontmatter: { status: 'draft' }, bodyText: 'a TODO remains' }))).toEqual([]);
        expect(codes(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'a TODO remains' })))).toEqual(['C007']);
        expect(codes(check_no_tbd_at_ready(spec({ frontmatter: { status: 'ready' }, bodyText: 'has ??? still' })))).toEqual(['C007']);
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
