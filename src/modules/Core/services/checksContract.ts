// The checks contract (swarm/checks/checks.yaml + docs/reference/checks.md), implemented in code.
// checks.yaml sanctions implementing the reference directly ("Read the rules from checks.yaml, or
// implement the checks reference directly — they must agree over the core checks"). We pin the
// contract version and the C-code table here; a drift-guard test asserts they match the sibling
// swarm repo when it is present, so swarm-cli stays hermetic (no runtime dependency on swarm/) while
// catching divergence.
//
// These rule functions are PURE over a ParsedSpec record — the parser (Sol) extracts the structure;
// this module owns the contract semantics (strength words, the Verify-line shape, link
// classification). C009's filesystem check takes an injected `exists` predicate so it stays pure.
// C002 (cross-file id collision) and C010/C011 (change-plan) are workspace/artifact-scope and live
// with the workspace checker, not here.

import type { OutcomeLevel } from '../useCases/unixOutcome.ts';

// Pinned to swarm/checks/checks.yaml `version:`; the drift-guard test fails if the sibling diverges.
export const CONTRACT_VERSION = '0.4.1';

export type CheckSeverity = 'hard-error' | 'warning';

export type CheckId = 'C001' | 'C002' | 'C003' | 'C004' | 'C005' | 'C006' | 'C007' | 'C008' | 'C009' | 'C010' | 'C011';

// Severity per check, the single source inside swarm-cli; a total Record so the lookup needs no
// fallback. The drift guard reconciles it against swarm/checks/checks.yaml.
const SEVERITY_BY_ID: Record<CheckId, CheckSeverity> = {
    C001: 'hard-error',
    C002: 'hard-error',
    C003: 'hard-error',
    C004: 'warning',
    C005: 'warning',
    C006: 'warning',
    C007: 'hard-error',
    C008: 'warning',
    C009: 'hard-error',
    C010: 'hard-error',
    C011: 'warning',
};

export function severity_of(id: CheckId): CheckSeverity {
    return SEVERITY_BY_ID[id];
}

// Mirrors checks.yaml `core_checks`, id + name + severity (severity drawn from the table above).
export const CORE_CHECKS: readonly { id: CheckId; name: string; severity: CheckSeverity }[] = [
    { id: 'C001', name: 'unique-ids', severity: severity_of('C001') },
    { id: 'C002', name: 'duplicate-id', severity: severity_of('C002') },
    { id: 'C003', name: 'verify-with', severity: severity_of('C003') },
    { id: 'C004', name: 'one-strength-word', severity: severity_of('C004') },
    { id: 'C005', name: 'non-goals-present', severity: severity_of('C005') },
    { id: 'C006', name: 'open-questions-present', severity: severity_of('C006') },
    { id: 'C007', name: 'no-tbd-at-ready', severity: severity_of('C007') },
    { id: 'C008', name: 'sources-named', severity: severity_of('C008') },
    { id: 'C009', name: 'broken-source-link', severity: severity_of('C009') },
    { id: 'C010', name: 'preserves-refs-resolve', severity: severity_of('C010') },
    { id: 'C011', name: 'waves-present', severity: severity_of('C011') },
];

// The five strength words (checks.yaml reconciliation note: 5; SOL form is the same words uppercase).
// Ordered longest-first so `must not` / `should not` match before `must` / `should`.
const STRENGTH_WORDS = ['must not', 'must', 'should not', 'should', 'may'] as const;

const STRENGTH_WORD_PATTERN = new RegExp(`\\b(?:${STRENGTH_WORDS.join('|')})\\b`, 'gi');

// The Verify line a requirement must carry (C003) — `Verify with:` (simple form) or `VERIFY BY`
// (SOL form). Anchored to a line start so it is the requirement's own line, not prose.
const VERIFY_LINE_PATTERN = /^[ \t>-]*(?:Verify with:|VERIFY BY)/m;

// At `status: ready`, none of these may remain (C007). At draft they are fine.
const UNRESOLVED_MARKER_PATTERN = /\b(?:TBD|TODO)\b|\?\?\?/;

// --- The records the rules key on (the parser produces a structurally-compatible value) ----------

export type Requirement = Readonly<{
    id: string;
    line: number;
    body: string;
}>;

export type SpecLink = Readonly<{
    raw: string;
    line: number;
}>;

export type SpecFrontmatter = Readonly<{
    type: string | null;
    id: string | null;
    status: string | null;
    format: string | null;
    sources: readonly string[];
}>;

export type ParsedSpec = Readonly<{
    frontmatter: SpecFrontmatter;
    requirements: readonly Requirement[];
    sectionTitles: readonly string[];
    nonGoalsBody: string;
    openQuestionsPresent: boolean;
    bodyText: string;
    links: readonly SpecLink[];
}>;

export type Diagnostic = Readonly<{
    code: CheckId;
    severity: CheckSeverity;
    message: string;
    line: number | null;
}>;

function diagnostic(code: CheckId, message: string, line: number | null): Diagnostic {
    return { code, severity: severity_of(code), message, line };
}

// A workspace path/cross-reference (resolve it) vs a bare external tracker id like `JIRA-123`
// (exempt — naming it is C008's concern, not C009's).
export function is_workspace_ref(raw: string): boolean {
    const value = raw.trim();
    if (value.length === 0) {
        return false;
    }
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('mailto:')) {
        return false;
    }
    // A bare tracker id: UPPERCASE letters, a dash, digits, and nothing else (no path separators).
    if (/^[A-Z]+-\d+$/.test(value)) {
        return false;
    }
    // A workspace ref is a path (has a separator) or names a doc-like file by extension. A bare
    // name without either (a prose token, an unqualified cross-ref) is not resolvable here — bare
    // cross-ref id resolution is workspace-scope (C002), not a single-file path check.
    return value.includes('/') || /\.(?:md|ya?ml|json|ts|txt)$/i.test(value);
}

function count_strength_words(text: string): number {
    const matches = text.match(STRENGTH_WORD_PATTERN);
    return matches === null ? 0 : matches.length;
}

// --- C001 unique-ids -----------------------------------------------------------------------------
export function check_unique_ids(spec: ParsedSpec): Diagnostic[] {
    const seen = new Map<string, number>();
    const diagnostics: Diagnostic[] = [];
    for (const requirement of spec.requirements) {
        const previous = seen.get(requirement.id);
        if (previous !== undefined) {
            diagnostics.push(
                diagnostic(
                    'C001',
                    `requirement id ${requirement.id} appears more than once (also line ${previous})`,
                    requirement.line
                )
            );
            continue;
        }
        seen.set(requirement.id, requirement.line);
    }
    return diagnostics;
}

// --- C003 verify-with ----------------------------------------------------------------------------
export function check_verify_with(spec: ParsedSpec): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const requirement of spec.requirements) {
        if (!VERIFY_LINE_PATTERN.test(requirement.body)) {
            diagnostics.push(
                diagnostic('C003', `requirement ${requirement.id} has no "Verify with:" line`, requirement.line)
            );
        }
    }
    return diagnostics;
}

// --- C004 one-strength-word ----------------------------------------------------------------------
export function check_one_strength_word(spec: ParsedSpec): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const requirement of spec.requirements) {
        const count = count_strength_words(requirement.body);
        if (count !== 1) {
            diagnostics.push(
                diagnostic(
                    'C004',
                    `requirement ${requirement.id} states ${count} strength words (expected exactly one)`,
                    requirement.line
                )
            );
        }
    }
    return diagnostics;
}

// --- C005 non-goals-present ----------------------------------------------------------------------
export function check_non_goals(spec: ParsedSpec): Diagnostic[] {
    const present = spec.sectionTitles.some((title) => title.toLowerCase() === 'non-goals');
    if (!present || spec.nonGoalsBody.trim().length === 0) {
        return [diagnostic('C005', 'no non-empty Non-goals section', null)];
    }
    return [];
}

// --- C006 open-questions-present -----------------------------------------------------------------
export function check_open_questions(spec: ParsedSpec): Diagnostic[] {
    if (!spec.openQuestionsPresent) {
        return [diagnostic('C006', 'no Open questions section (it may say "none")', null)];
    }
    return [];
}

// --- C007 no-tbd-at-ready ------------------------------------------------------------------------
export function check_no_tbd_at_ready(spec: ParsedSpec): Diagnostic[] {
    if (spec.frontmatter.status !== 'ready') {
        return [];
    }
    if (UNRESOLVED_MARKER_PATTERN.test(spec.bodyText)) {
        return [diagnostic('C007', 'a TBD / TODO / ??? marker remains at status: ready', null)];
    }
    return [];
}

// --- C008 sources-named --------------------------------------------------------------------------
export function check_sources_named(spec: ParsedSpec): Diagnostic[] {
    if (spec.frontmatter.sources.length === 0) {
        return [diagnostic('C008', 'frontmatter sources: names no origin', null)];
    }
    return [];
}

// --- C009 broken-source-link ---------------------------------------------------------------------
export type CheckBrokenLinksInput = Readonly<{
    spec: ParsedSpec;
    exists: (workspaceRef: string) => boolean;
}>;

export function check_broken_source_link(input: CheckBrokenLinksInput): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const frontmatterRefs: SpecLink[] = input.spec.frontmatter.sources.map((raw) => ({ raw, line: 0 }));
    for (const link of [...frontmatterRefs, ...input.spec.links]) {
        if (!is_workspace_ref(link.raw)) {
            continue;
        }
        if (!input.exists(link.raw)) {
            diagnostics.push(
                diagnostic('C009', `source/reference does not resolve: ${link.raw}`, link.line === 0 ? null : link.line)
            );
        }
    }
    return diagnostics;
}

// --- The single-file runner + verdict ------------------------------------------------------------
export type RunSpecChecksInput = Readonly<{
    spec: ParsedSpec;
    exists: (workspaceRef: string) => boolean;
}>;

export function run_spec_checks(input: RunSpecChecksInput): Diagnostic[] {
    return [
        ...check_unique_ids(input.spec),
        ...check_verify_with(input.spec),
        ...check_one_strength_word(input.spec),
        ...check_non_goals(input.spec),
        ...check_open_questions(input.spec),
        ...check_no_tbd_at_ready(input.spec),
        ...check_sources_named(input.spec),
        ...check_broken_source_link({ spec: input.spec, exists: input.exists }),
    ];
}

// Aggregate diagnostics to one outcome level: any hard-error → blocking, else any warning → warning,
// else clean (AC-005 exit mapping).
export function verdict_for(diagnostics: readonly Diagnostic[]): OutcomeLevel {
    if (diagnostics.some((entry) => entry.severity === 'hard-error')) {
        return 'blocking';
    }
    if (diagnostics.length > 0) {
        return 'warning';
    }
    return 'clean';
}
