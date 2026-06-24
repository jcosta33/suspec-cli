// The checks contract (corpus/checks/checks.yaml + docs/reference/checks.md), implemented in code.
// checks.yaml sanctions implementing the reference directly ("Read the rules from checks.yaml, or
// implement the checks reference directly — they must agree over the core checks"). We pin the
// contract version and the C-code table here; a drift-guard test asserts they match the sibling
// corpus repo when it is present, so corpus-cli stays hermetic (no runtime dependency on corpus/) while
// catching divergence.
//
// These rule functions are PURE over a ParsedSpec record — the parser (Sol) extracts the structure;
// this module owns the contract semantics (strength words, the Verify-line shape, link
// classification). C009's filesystem check takes an injected `exists` predicate so it stays pure;
// C010 takes an injected `spec_ref_resolves` predicate for the same reason (the engine reads the
// workspace). C002 (cross-file id collision) is workspace-scope and lives with the workspace checker.

import type { OutcomeLevel } from '../useCases/unixOutcome.ts';
import { strip_inline_code } from '../../../infra/markdownScan.ts';

// Pinned to corpus/checks/checks.yaml `version:`; the drift-guard test fails if the sibling diverges.
export const CONTRACT_VERSION = '0.9.0';

export type CheckSeverity = 'hard-error' | 'warning';

// prettier-ignore
export type CheckId =
    | 'C001' | 'C002' | 'C003' | 'C004' | 'C005' | 'C006'
    | 'C007' | 'C008' | 'C009' | 'C010' | 'C011' | 'C012' | 'C013' | 'C014' | 'C015'
    | 'C016' | 'C017';

// Severity per check, the single source inside corpus-cli; a total Record so the lookup needs no
// fallback. The drift guard reconciles it against corpus/checks/checks.yaml.
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
    C012: 'warning',
    C013: 'warning',
    C014: 'warning',
    C015: 'warning',
    // C016 pass-needs-evidence: the contract pins it hard-error (checks.yaml review_file content_rule).
    // The GATE path (`corpus check <review>`) honors that — an empty-Evidence Pass is a structural
    // contradiction, not a judgment call. The reconcile path (`corpus review`) still surfaces the same
    // fact advisorily (ADR-0077 D8 never blocks); see ADR-0097.
    C016: 'hard-error',
    C017: 'warning',
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
    { id: 'C012', name: 'coverage', severity: severity_of('C012') },
    { id: 'C013', name: 'verify-evidence-binding', severity: severity_of('C013') },
    { id: 'C014', name: 'do-not-change-touched', severity: severity_of('C014') },
    { id: 'C015', name: 'citation-resolves', severity: severity_of('C015') },
    { id: 'C016', name: 'pass-needs-evidence', severity: severity_of('C016') },
    { id: 'C017', name: 'orphaned-reference', severity: severity_of('C017') },
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
    // The deduped inline `[[KEY]]` citation keys the parser marked distinctly from `links` (C015).
    citations: readonly string[];
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
    // Strip inline-code spans per line so a strength word quoted in code (a `should:` config key, a
    // `--should-skip` flag, an error string `input must be non-empty`) is not counted as a stated
    // requirement modal (#31). The parser already drops fenced blocks from the requirement body.
    const visible = text
        .split('\n')
        .map((line) => strip_inline_code(line))
        .join('\n');
    const matches = visible.match(STRENGTH_WORD_PATTERN);
    return matches === null ? 0 : matches.length;
}

// A requirement's STATEMENT is the prose before its Verify line. C004 counts strength words there
// only — a `Verify with:` line ("a test that proves it must reject …") and trailing commentary
// naturally carry modals, so scanning the whole body both false-positives and false-negatives.
function statement_text(body: string): string {
    const verify = VERIFY_LINE_PATTERN.exec(body);
    return verify === null ? body : body.slice(0, verify.index);
}

// A leading SOL trigger clause: the requirement opens with an uppercase EARS keyword (the SOL form).
const SOL_TRIGGER = /^\s*(?:WHERE|WHILE|WHEN|IF)\b/;
// The SOL response-clause marker: an uppercase standalone `THE` introduces `THE <actor> <STRENGTH> …`.
const SOL_RESPONSE = /\bTHE\b/;

// For C004's strength count on a SOL (`format: sol`) requirement, narrow to its RESPONSE clause
// (`THE <actor> <STRENGTH> …`). In the SOL grammar the binding strength word lives in the response, NOT
// in the trigger condition (`WHEN/IF/WHILE/WHERE …`), but a condition naturally carries a conditional
// modal — "WHEN a request MAY be retried THE service MUST be idempotent" has one obligation, not two.
// Strip a leading SOL trigger up to the first uppercase `THE` so the condition's modal is not miscounted
// (R5-I02). Gated on `format: sol`, so a plain prose spec is untouched BY CONSTRUCTION (never by the
// regex casing alone).
function response_clause(statement: string, isSol: boolean): string {
    if (!isSol || !SOL_TRIGGER.test(statement)) {
        return statement;
    }
    const response = SOL_RESPONSE.exec(statement);
    return response === null ? statement : statement.slice(response.index);
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
    const isSol = spec.frontmatter.format === 'sol';
    for (const requirement of spec.requirements) {
        const count = count_strength_words(response_clause(statement_text(requirement.body), isSol));
        if (count !== 1) {
            // R5-I12: the message names the action, not just the count — builders praised the rule but had
            // to map the bare count to "split bundled behaviors" / "add the missing MUST" themselves.
            const remedy =
                count > 1
                    ? ' — split into one obligation per requirement'
                    : ' — add the one strength word (MUST/SHOULD/…) this requirement binds on';
            diagnostics.push(
                diagnostic(
                    'C004',
                    `requirement ${requirement.id} states ${count} strength words (expected exactly one)${remedy}`,
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

// --- C015 citation-resolves (ADR-0087) -----------------------------------------------------------
// A spec's inline `[[KEY]]` citation that resolves to no `<a id="KEY">` anchor in the workspace's
// sources.md is surfaced as a C015 warning — a dangling citation (the discipline CLAUDE.md's
// "citations are contextual" rule names). PURE over the parsed record: the engine injects
// `anchor_resolves: (key) => boolean`, built by reading the sources.md the spec's frontmatter
// `sources:` names and extracting its `<a id="…">` anchors (mirrors C009's injected `exists`).
//
// Skip-when-nothing-to-check (ADR-0087 Decision 3): if no sources.md is resolvable, the command
// passes `anchor_resolves = () => true`, so the check admits every key and never false-flags. C015
// fires only when a sources.md is resolvable AND a `[[KEY]]` has no matching anchor. v0 is the
// dangling-anchor case only; the tier checks (a MUST-level claim citing a Caveated/Rejected entry)
// are deferred to a separate v1 decision (ADR-0087 Decision 4).
export function check_citation_resolves(spec: ParsedSpec, anchor_resolves: (key: string) => boolean): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const key of spec.citations) {
        if (!anchor_resolves(key)) {
            diagnostics.push(
                diagnostic('C015', `citation [[${key}]] resolves to no \`<a id>\` anchor in sources.md`, null)
            );
        }
    }
    return diagnostics;
}

// --- C012 coverage (ADR-0079) --------------------------------------------------------------------
// The review-packet coverage reconcile: keyed on the task packet's declared `scope` as the in-scope
// id set, against the source spec's requirement ids and the coverage rows present in the review
// packet. Two faces, both `warning`:
//   - uncovered — an in-scope id with no coverage row (the dominant "not reviewed yet" signal).
//   - orphan    — a coverage row naming an id absent from the source spec (stale/mistyped id).
// Scope-guarded to non-draft source specs: a `draft` spec's ids are work-in-progress, so the check
// is exempt (mirrors C002's draft exemption). PURE — plain id sets in, diagnostics out; the engine
// (reconcileReview) does the I/O and passes the extracted ids here.
export type CoverageInput = Readonly<{
    sourceSpecStatus: string | null;
    inScopeIds: readonly string[];
    specRequirementIds: readonly string[];
    coverageRowIds: readonly string[];
}>;

// A structured C012 finding: an in-scope id with no coverage row (uncovered) or a coverage row
// naming an id absent from the source spec (orphan). Structured so the review engine maps fields
// rather than re-parsing the diagnostic message.
export type CoverageFinding = Readonly<{ id: string; kind: 'uncovered' | 'orphan' }>;

// The message a coverage finding renders to — single-sourced, so `check_coverage`'s Diagnostic and
// the review engine's surfaced fact share the exact wording.
export function coverage_message(finding: CoverageFinding): string {
    return finding.kind === 'uncovered'
        ? `requirement ${finding.id} is in scope but has no coverage row (uncovered)`
        : `coverage row ${finding.id} names an id absent from the source spec (orphan)`;
}

// The structured C012 facts. PURE; the draft scope guard lives here so both faces (the `corpus check`
// Diagnostic and the `corpus review` surfaced fact) inherit it.
export function coverage_facts(input: CoverageInput): CoverageFinding[] {
    // Draft scope guard: a draft source spec's ids are not finalized claims.
    if (input.sourceSpecStatus === 'draft') {
        return [];
    }
    const specIdSet = new Set(input.specRequirementIds);
    const coveredSet = new Set(input.coverageRowIds);
    const findings: CoverageFinding[] = [];

    // uncovered: an in-scope id with no coverage row. Deduped per id (a scope list that names the same
    // id twice surfaces it once), mirroring the orphan branch below (#32).
    const seenUncovered = new Set<string>();
    for (const id of input.inScopeIds) {
        if (!coveredSet.has(id) && !seenUncovered.has(id)) {
            seenUncovered.add(id);
            findings.push({ id, kind: 'uncovered' });
        }
    }
    // orphan: a coverage row naming an id the source spec does not define. A coverage row id is only
    // reported once (a duplicate row is a different concern), so dedupe via a seen set.
    const seenOrphan = new Set<string>();
    for (const id of input.coverageRowIds) {
        if (!specIdSet.has(id) && !seenOrphan.has(id)) {
            seenOrphan.add(id);
            findings.push({ id, kind: 'orphan' });
        }
    }
    return findings;
}

export function check_coverage(input: CoverageInput): Diagnostic[] {
    return coverage_facts(input).map((finding) => diagnostic('C012', coverage_message(finding), null));
}

// --- spec-coverage drift (corpus-works#72 item 2; corpus-cli#1) -----------------------------------
// Advisory, NOT a contract check: no C-id, no `checks.yaml` entry, no contract-version bump — it
// surfaces a neutral reconcile fact, reconcile-only until measured 0-FP on the real corpus and only
// then promoted to a check (honesty framework, ADR-0063; matches the packet-size neutral-info posture).
// The noise source to measure before any check promotion is a non-draft spec's deliberately-deferred
// (not-yet-tasked) ACs: the untracked set legitimately includes them — fine as neutral info, noisy as
// a warning. So "0-FP" is UNMEASURED here, not asserted.
// Distinct axis from C012: C012 compares the task's `scope` to the review's coverage rows; this
// compares the *source spec's* requirement ids to the task `scope` — the "the spec grew under the
// task/review" drift. The untracked set is the spec ids no task scope tracks. PURE — id sets in,
// a drift summary out (or null when fully tracked); the engine does the I/O. Scope-guarded to
// non-draft source specs (mirrors C012 / the ADR-0079 guard).
export type SpecCoverageDriftInput = Readonly<{
    sourceSpecStatus: string | null;
    specRequirementIds: readonly string[];
    inScopeIds: readonly string[];
}>;

export type SpecCoverageDrift = Readonly<{
    specCount: number;
    trackedCount: number;
    untracked: readonly string[];
}>;

// The message a drift renders to — single-sourced so the reconcile fact and any future Diagnostic
// share the exact wording.
export function spec_coverage_drift_message(drift: SpecCoverageDrift): string {
    return `spec has ${drift.specCount} requirements; task scope tracks ${drift.trackedCount}; ${drift.untracked.length} untracked: ${drift.untracked.join(', ')}`;
}

// The structured drift fact, or null when there is nothing to surface (fully tracked, no spec ids, or
// a draft source spec whose ids are not finalized claims). PURE.
export function spec_coverage_drift_facts(input: SpecCoverageDriftInput): SpecCoverageDrift | null {
    if (input.sourceSpecStatus === 'draft') {
        return null;
    }
    // Unique spec ids, first-seen order preserved (a spec that names an id twice counts it once).
    const seen = new Set<string>();
    const specIds: string[] = [];
    for (const id of input.specRequirementIds) {
        if (!seen.has(id)) {
            seen.add(id);
            specIds.push(id);
        }
    }
    const scopeSet = new Set(input.inScopeIds);
    const untracked = specIds.filter((id) => !scopeSet.has(id));
    if (untracked.length === 0) {
        return null;
    }
    return { specCount: specIds.length, trackedCount: specIds.length - untracked.length, untracked };
}

// --- C013 verify-evidence-binding (ADR-0083) -----------------------------------------------------
// The structured-evidence reconcile against the named source spec. A coverage row may carry an
// optional fenced `verify` block (a sibling to the row). Where present against a Pass row, this
// surfaces a CONSISTENCY fact: does the block's recorded `cmd` match the requirement's named
// `Verify with:` / `VERIFY BY` command (closed-value, exact after whitespace-collapse — never prose
// matching) and read `result=pass`? It is NEVER a verdict (ADR-0077 D8) and NEVER proof the command
// ran — the fenced body is self-reported and unparsed; this reads only the closed-value info-string.
//
// The five faces, all `warning` (the structured-form mismatch is hard-capable but ships conservative
// per ADR-0083):
//   - cmd-mismatch    — a block's `cmd` disagrees with the requirement's named command.
//   - result-fail     — a `result=fail` block recorded under a Pass row.
//   - malformed       — a block whose info-string did not parse to a complete binding.
//   - duplicate       — more than one block keyed to the same requirement id.
//   - free-form-only  — a Pass row with no verify block (only the free-form cell; the fuzzy band,
//                       routed to human attention, never machine-rejected — SMELLS-precision).
// A Pass row whose block's `cmd` matches and reads `result=pass` is consistent → no finding.
// Scope-guarded to non-draft source specs (mirrors C012 / the ADR-0079 guard). PURE — plain records
// in, structured findings out; the engine (reconcileReview) does the I/O and extraction.
export type VerifyBlockFact = Readonly<{
    id: string | null;
    cmd: string | null;
    result: 'pass' | 'fail' | null;
    malformed: boolean;
}>;

export type VerifyBindingInput = Readonly<{
    sourceSpecStatus: string | null;
    // The requirement's named verify command per id (null when the requirement names none). The
    // engine lifts this from the parsed spec record; the C013 reconcile keys on it.
    namedCommandById: ReadonlyMap<string, string | null>;
    // The coverage rows (id + raw Result cell) — C013 keys on Pass rows.
    coverageRows: readonly { id: string; result: string }[];
    // The structured-evidence blocks parsed from the coverage section.
    verifyBlocks: readonly VerifyBlockFact[];
}>;

export type VerifyBindingFinding = Readonly<{
    id: string;
    kind: 'cmd-mismatch' | 'result-fail' | 'malformed' | 'duplicate' | 'free-form-only';
}>;

// Normalize a Verify command for the closed-value comparison (ADR-0083: exact after normalization).
// Collapse whitespace, then strip a trailing note (a `(parenthetical)` OR an em/en-dash clause) and
// surrounding backticks — the canon's own `Verify with:` format wraps the command in backticks and may
// carry a trailing note (docs/04, the examples), while the review block records it bare; both sides MUST
// normalize identically or a conformant block false-fires a cmd-mismatch (corpus-works #16). The note is
// stripped before the backticks so the documented ``cmd`` (note) / ``cmd`` — note forms reduce cleanly to
// the bare command. The dash form keys on an EM/EN dash (—/–), never the ASCII hyphen, so a real flag
// like `npm test -- a.spec.ts` is never truncated (R4-ISS-11).
export function normalize_cmd(value: string): string {
    return value
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\s*\([^()]*\)\s*$/, '')
        .replace(/\s+[—–]\s.*$/, '')
        .replace(/^`+/, '')
        .replace(/`+$/, '')
        .trim();
}

export function verify_binding_message(finding: VerifyBindingFinding): string {
    switch (finding.kind) {
        case 'cmd-mismatch':
            return `coverage row ${finding.id}'s verify block records a cmd that does not match the requirement's named Verify command`;
        case 'result-fail':
            return `coverage row ${finding.id} is Pass but its verify block records result=fail`;
        case 'malformed':
            return `coverage row ${finding.id} carries a malformed verify block (its info-string did not parse to id / cmd / result)`;
        case 'duplicate':
            return `requirement ${finding.id} carries more than one verify block`;
        case 'free-form-only':
            // R5-I11: spell out that this is ADVISORY + how to silence it, so it doesn't read as "you
            // reviewed wrong". A prose Evidence cell can't be machine-matched, so it routes to a human.
            return `coverage row ${finding.id} is Pass with only a free-form Evidence cell (advisory — add a \`verify\` block to machine-confirm, or leave as-is to route to human attention)`;
    }
}

export function verify_binding_facts(input: VerifyBindingInput): VerifyBindingFinding[] {
    // Draft scope guard: a draft source spec's ids and named commands are work-in-progress.
    if (input.sourceSpecStatus === 'draft') {
        return [];
    }
    const findings: VerifyBindingFinding[] = [];

    // Index the blocks by keyed id. A block whose info-string named no id (malformed, id === null) is
    // surfaced on its own — it cannot be joined to a row.
    const blocksById = new Map<string, VerifyBlockFact[]>();
    for (const block of input.verifyBlocks) {
        if (block.id === null) {
            findings.push({ id: '(unkeyed)', kind: 'malformed' });
            continue;
        }
        const bucket = blocksById.get(block.id);
        if (bucket === undefined) {
            blocksById.set(block.id, [block]);
        } else {
            bucket.push(block);
        }
    }
    // A duplicate is surfaced once per id (more than one block keyed to the same id).
    for (const [id, blocks] of blocksById) {
        if (blocks.length > 1) {
            findings.push({ id, kind: 'duplicate' });
        }
    }
    // A keyed malformed block is surfaced regardless of its row's result, once per id — AC-004 + the
    // canon require it not be silently dropped, and this restores parity with `duplicate` above (the
    // `(unkeyed)` malformed block is already surfaced in the indexing loop). The Pass-row loop below
    // therefore no longer re-emits malformed (#32).
    const seenMalformed = new Set<string>();
    for (const [id, blocks] of blocksById) {
        if (blocks.some((block) => block.malformed) && !seenMalformed.has(id)) {
            seenMalformed.add(id);
            findings.push({ id, kind: 'malformed' });
        }
    }

    for (const row of input.coverageRows) {
        if (row.result !== 'Pass') {
            continue; // C013 keys on Pass rows (the recorded-as-passed claim).
        }
        const blocks = blocksById.get(row.id) ?? [];
        if (blocks.length === 0) {
            // A Pass row with no verify block — the free-form-only warning (fuzzy band, ADR-0083).
            findings.push({ id: row.id, kind: 'free-form-only' });
            continue;
        }
        // The first keyed block backs the row (duplicate + malformed are already surfaced above,
        // unconditionally, so a malformed block here is skipped rather than re-emitted).
        const block = blocks[0];
        if (block.malformed) {
            continue;
        }
        if (block.result === 'fail') {
            findings.push({ id: row.id, kind: 'result-fail' });
            continue;
        }
        const named = input.namedCommandById.get(row.id) ?? null;
        // A closed-value command comparison (never prose). A named command absent from the spec
        // cannot be matched — the recorded cmd disagrees with "nothing named" → a mismatch fact.
        if (named === null || block.cmd === null || normalize_cmd(block.cmd) !== normalize_cmd(named)) {
            findings.push({ id: row.id, kind: 'cmd-mismatch' });
        }
        // else: cmd matches + result=pass → consistent, no finding.
    }
    return findings;
}

export function check_verify_binding(input: VerifyBindingInput): Diagnostic[] {
    return verify_binding_facts(input).map((finding) => diagnostic('C013', verify_binding_message(finding), null));
}

// --- C016 pass-needs-evidence (ADR-0097; the implemented pass-needs-evidence content_rule) --------
// A coverage row recorded as `Pass` whose Evidence cell is empty is a STRUCTURAL contradiction: a
// Pass needs pasted output, a CI link, or (for a manual Verify) a named human's recorded observation
// — an empty cell reads Unverified, never Pass. Unlike C012/C013 (judgment-laden facts shipped at
// warning), this is unambiguous, so the contract pins it hard-error and the GATE path blocks on it.
// The reconcile path (`corpus review`) surfaces the SAME row ids advisorily (it never blocks, ADR-0077
// D8) — hence one predicate, two surfaces. PURE: the row records in, ids/diagnostics out.
export type CoverageEvidenceRow = Readonly<{ id: string; result: string; evidence: string }>;

// The single source for "a Pass row with no evidence" — both the gate Diagnostic (C016, below) and the
// reconcile advisory field (reconcileFacts.empty_evidence_pass_rows) derive from this, so the two
// surfaces can never disagree on what counts.
export function pass_rows_missing_evidence(rows: readonly CoverageEvidenceRow[]): string[] {
    return rows.filter((row) => row.result === 'Pass' && row.evidence.trim().length === 0).map((row) => row.id);
}

export function check_pass_evidence(rows: readonly CoverageEvidenceRow[]): Diagnostic[] {
    return pass_rows_missing_evidence(rows).map((id) =>
        diagnostic(
            'C016',
            `coverage row ${id} is Pass with an empty Evidence cell — a Pass needs pasted output, a CI link, or a named manual observation (an empty cell reads Unverified)`,
            null
        )
    );
}

// --- Packet diff size (neutral info; ADR-0094 size signal) ---------------------------------------
// ADR-0094 named an oversized-packet heuristic as a toolable signal ([[SMARTBEAR]] 200-400 LOC,
// diffusion via [[BOSU15]]). Measuring real task diffs (ADR-0097) showed a raw LOC/files BAND cannot
// be both useful and low-FP for code tasks: legitimate feature-with-tests commits occupy the same
// 600-1200 LOC range as genuinely-too-big ones (≈15% false-positive at a 600-LOC band; a 0-FP band of
// ≥1500 LOC never fires on the population it targets). So the band-based CHECK is specified-not-shipped
// (ADR-0097), and the size is surfaced as NEUTRAL INFO instead — the reviewer sees the diff size and
// makes their own decomposition judgment, no threshold asserted. Generated / vendored / lockfile churn
// is excluded so the number reflects human-authored review surface. PURE: per-file LOC in, totals out.
export type ChangedFileStat = Readonly<{ path: string; loc: number }>;

const GENERATED_PATH =
    /(?:^|\/)(?:node_modules|vendor|dist|build|out|\.next|coverage|__snapshots__)\/|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Cargo\.lock|poetry\.lock|Gemfile\.lock|go\.sum)$|\.(?:min\.(?:js|css)|map|snap|lock)$|\.generated\./;

export function is_generated_path(path: string): boolean {
    return GENERATED_PATH.test(path);
}

export type PacketSizeFacts = Readonly<{
    changedLoc: number; // sum of insertions+deletions over non-generated files
    filesTouched: number; // count of non-generated files
}>;

export function packet_size_facts(stats: readonly ChangedFileStat[]): PacketSizeFacts {
    const authored = stats.filter((stat) => !is_generated_path(stat.path));
    return {
        changedLoc: authored.reduce((sum, stat) => sum + stat.loc, 0),
        filesTouched: authored.length,
    };
}

// --- C010 preserves-refs-resolve (change-plan, hard error) ---------------------------------------
// Every id in a change plan's `preserves:` and Behavioral-preservation-guarantees table must
// resolve: a `SPEC-x#AC-NNN` ref against the named spec (the spec exists and defines AC-NNN), or a
// plan-local `PG-NNN` defined in the plan's own guarantees table. A `PG-NNN` (no spec id) is a
// VALID plan-local id, not a failure (the guarantee was never specced — a spec amendment is owed).
// Any other unresolvable id → one C010 hard-error citing the unresolved id.
//
// PURE: the parser extracts the ids; the engine injects `spec_ref_resolves` (does spec X define
// AC-NNN?) so the filesystem stays out of this module (mirrors C009's injected `exists`).
export type PreservesRef = Readonly<{
    raw: string;
    specId: string | null;
    acId: string | null;
    line: number | null;
}>;

export type PreservesRefsInput = Readonly<{
    refs: readonly PreservesRef[];
    // The ids defined in the plan's own guarantees table — a plan-local id (no spec) resolves here.
    guaranteeIds: readonly string[];
    // Whether the named spec exists and defines the anchor (injected; the engine reads the workspace).
    spec_ref_resolves: (specId: string, acId: string) => boolean;
}>;

export function check_preserves_refs_resolve(input: PreservesRefsInput): Diagnostic[] {
    const guaranteeSet = new Set(input.guaranteeIds);
    const diagnostics: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const ref of input.refs) {
        if (seen.has(ref.raw)) {
            continue;
        }
        seen.add(ref.raw);
        if (ref.specId !== null && ref.acId !== null) {
            // A cross-spec reference: resolve against the named spec.
            if (!input.spec_ref_resolves(ref.specId, ref.acId)) {
                diagnostics.push(diagnostic('C010', `preserved ref does not resolve: ${ref.raw}`, ref.line));
            }
            continue;
        }
        // A plan-local id: valid iff defined in the plan's own guarantees table.
        if (!guaranteeSet.has(ref.raw)) {
            diagnostics.push(diagnostic('C010', `preserved ref does not resolve: ${ref.raw}`, ref.line));
        }
    }
    return diagnostics;
}

// --- C011 waves-present (change-plan, warning) ---------------------------------------------------
// A change plan whose `kind` is migration / rewrite / schema-change must stage the move in waves,
// each naming the green check that keeps the codebase green. Warn when the Transformation-waves
// section is empty or any wave names no check/verify step. A plan of another kind is exempt (a
// pure refactor or a mechanical cleanup needs no staged wave plan).
// PURE: the parser extracts kind + the waves (each carrying whether it names a check).
const WAVE_REQUIRED_KINDS = new Set(['migration', 'rewrite', 'schema-change']);

export type Wave = Readonly<{ namesCheck: boolean; line: number | null }>;

export type WavesPresentInput = Readonly<{
    kind: string | null;
    waves: readonly Wave[];
}>;

export function check_waves_present(input: WavesPresentInput): Diagnostic[] {
    if (input.kind === null || !WAVE_REQUIRED_KINDS.has(input.kind)) {
        return [];
    }
    if (input.waves.length === 0) {
        return [diagnostic('C011', `a ${input.kind} change plan has an empty Transformation waves section`, null)];
    }
    if (input.waves.some((wave) => !wave.namesCheck)) {
        const offender = input.waves.find((wave) => !wave.namesCheck);
        return [
            diagnostic(
                'C011',
                'a transformation wave names no green check that keeps the codebase green',
                offender?.line ?? null
            ),
        ];
    }
    return [];
}

// --- The single-file runner + verdict ------------------------------------------------------------
export type RunSpecChecksInput = Readonly<{
    spec: ParsedSpec;
    exists: (workspaceRef: string) => boolean;
    // Resolves a `[[KEY]]` citation to whether sources.md carries a matching `<a id="KEY">` anchor
    // (C015). Injected like `exists` so the engine stays pure; defaults to admit-every-key, so a
    // caller with no sources.md (the skip-when-nothing-to-check rule, ADR-0087) never false-flags.
    anchor_resolves?: (key: string) => boolean;
}>;

export function run_spec_checks(input: RunSpecChecksInput): Diagnostic[] {
    const anchor_resolves = input.anchor_resolves ?? (() => true);
    return [
        ...check_unique_ids(input.spec),
        ...check_verify_with(input.spec),
        ...check_one_strength_word(input.spec),
        ...check_non_goals(input.spec),
        ...check_open_questions(input.spec),
        ...check_no_tbd_at_ready(input.spec),
        ...check_sources_named(input.spec),
        ...check_broken_source_link({ spec: input.spec, exists: input.exists }),
        ...check_citation_resolves(input.spec, anchor_resolves),
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
