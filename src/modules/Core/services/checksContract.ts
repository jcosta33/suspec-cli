// The machine contract in suspec/checks/checks.yaml, implemented in code. The human reference in
// docs/reference/checks.md explains the same rules and must agree with it. We pin the
// contract version and the C-code table here; a drift-guard test asserts they match a sibling
// Suspec canon checkout when one is present, so the CLI stays hermetic while catching divergence.
//
// These rule functions are PURE over a ParsedSpec record — the parser (Sol) extracts the structure;
// this module implements the contract semantics (strength words, the Verify-line shape, link
// classification). C009's filesystem check takes an injected `exists` predicate so it stays pure;
// C010 takes an injected `spec_ref_resolves` predicate for the same reason (the command reads the
// files). C002 (cross-file id collision) keys on the file set passed in one invocation and lives
// with the file-set checker (checkArtifactSet).

import type { OutcomeLevel } from '../useCases/unixOutcome.ts';
import { scan_markdown, strip_inline_code, visible_text } from '../../../infra/markdownScan.ts';

// Pinned to suspec/checks/checks.yaml `version:`; the drift-guard test fails if the sibling diverges.
export const CONTRACT_VERSION = '0.18.0';

export type CheckSeverity = 'hard-error' | 'warning';

// prettier-ignore
export type CheckId =
    | 'C001' | 'C002' | 'C003' | 'C004'
    | 'C007' | 'C008' | 'C009' | 'C010' | 'C011' | 'C012' | 'C013' | 'C015'
    | 'C016' | 'C019' | 'C020' | 'C021' | 'C022' | 'C023' | 'C024';

// Severity per check, the single source inside suspec-cli; a total Record so the lookup needs no
// fallback. The drift guard reconciles it against suspec/checks/checks.yaml.
const SEVERITY_BY_ID: Record<CheckId, CheckSeverity> = {
    C001: 'hard-error',
    C002: 'hard-error',
    C003: 'hard-error',
    C004: 'warning',
    C007: 'hard-error',
    C008: 'warning',
    C009: 'hard-error',
    C010: 'hard-error',
    C011: 'warning',
    C012: 'warning',
    C013: 'warning',
    C015: 'warning',
    // C016 supported-needs-evidence: the contract pins it hard-error (checks.yaml review_file content_rule).
    // An empty-Evidence Supported is a structural contradiction, not a judgment call; see ADR-0097.
    C016: 'hard-error',
    C019: 'warning',
    // C020 unresolvable-ref (ADR-0128): a review names a task ref that does not resolve to the task
    // packet it is checked against, so the coverage/evidence checks would key on the wrong slice. A
    // review that can't be tied to its spec/task is structurally unverifiable, not a judgment call
    // (mirrors C016) — blocking severity at check time; the human owns what blocks a merge (ADR-0143).
    C020: 'hard-error',
    C021: 'hard-error',
    C022: 'hard-error',
    C023: 'hard-error',
    C024: 'hard-error',
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
    { id: 'C007', name: 'no-tbd-at-ready', severity: severity_of('C007') },
    { id: 'C008', name: 'sources-named', severity: severity_of('C008') },
    { id: 'C009', name: 'broken-source-link', severity: severity_of('C009') },
    { id: 'C010', name: 'preserves-refs-resolve', severity: severity_of('C010') },
    { id: 'C011', name: 'waves-present', severity: severity_of('C011') },
    { id: 'C012', name: 'coverage', severity: severity_of('C012') },
    { id: 'C013', name: 'verify-evidence-binding', severity: severity_of('C013') },
    { id: 'C015', name: 'citation-resolves', severity: severity_of('C015') },
    { id: 'C016', name: 'supported-needs-evidence', severity: severity_of('C016') },
    { id: 'C019', name: 'malformed-requirement-heading', severity: severity_of('C019') },
    { id: 'C020', name: 'unresolvable-ref', severity: severity_of('C020') },
    { id: 'C021', name: 'intent-present', severity: severity_of('C021') },
    { id: 'C022', name: 'task-shape', severity: severity_of('C022') },
    { id: 'C023', name: 'task-evidence', severity: severity_of('C023') },
    { id: 'C024', name: 'closed-task-resolved', severity: severity_of('C024') },
];

// --- C020 unresolvable-ref (ADR-0128, re-scoped by ADR-0143) --------------------------------------
// A `type: review` packet whose `task:` ref does not resolve to the task packet it is checked
// against — the handed packet identifies as a different task (or carries no id). Reconciling the
// review against the wrong slice would key C012 (coverage) and C013 (verify-binding) on the wrong
// scope, so a typo'd/renamed task ref must not silently pass. Hard error. Deliberately narrow to
// the task ref: the spec is likewise handed explicitly, and its identity is the reviewer's call.
export function unresolvable_ref_diagnostic(taskRef: string, handedTaskId: string | null): Diagnostic {
    const handed = handedTaskId === null ? 'a packet with no id' : `the packet for \`${handedTaskId}\``;
    return diagnostic(
        'C020',
        `review names task \`${taskRef}\` but was checked against ${handed} — coverage/evidence cannot be reconciled (unresolvable-ref)`,
        null
    );
}

// --- C002 duplicate-id (cross-file, within the passed set) ----------------------------------------
// Frontmatter `id:` uniqueness across the artifacts passed in one invocation (requirement ids stay
// spec-scoped — ADR-0080). Cross-file by nature, so it applies only when several artifacts are
// checked together; the id is each artifact's identity, and two artifacts claiming the same one is
// a hard collision whichever file is "right".
export function duplicate_id_diagnostic(id: string, firstPath: string, duplicatePath: string): Diagnostic {
    return diagnostic(
        'C002',
        `frontmatter id \`${id}\` appears in both ${firstPath} and ${duplicatePath} (duplicate-id)`,
        null
    );
}

// The five strength words (checks.yaml reconciliation note: 5; SOL form is the same words uppercase).
// Ordered longest-first so `must not` / `should not` match before `must` / `should`.
const STRENGTH_WORDS = ['must not', 'must', 'should not', 'should', 'may'] as const;

const STRENGTH_WORD_PATTERN = new RegExp(`\\b(?:${STRENGTH_WORDS.join('|')})\\b`, 'gi');

// The non-empty Verify line a requirement must carry (C003): `Verify with:` followed by content,
// or `VERIFY BY` followed by a separated command. Anchored to the requirement's own line.
const VERIFY_LINE_PATTERN = /^[ \t>-]*(?:Verify with:[ \t]*\S|VERIFY BY[ \t]+\S)/m;

// At `status: ready`, none of these may remain (C007). At draft they are fine.
const UNRESOLVED_MARKER_PATTERN = /\b(?:TBD|TODO)\b|\?\?\?/;

// The blocking-open-question half of C007 (checks.md: `status: ready` has no TBD, TODO, ???, "or
// blocking open question"): a `Blocking:` bullet (the plain-form record) or a SOL
// `QUESTION Q-NNN [blocking]` header — two surfaces of one record (the payment-5xx equivalence
// pair pins both). A question downgraded to `[non-blocking]` matches neither alternative.
const BLOCKING_QUESTION_PATTERN = /^[ \t>*+-]*Blocking:|^QUESTION\s+[A-Z][A-Z0-9]*-\d+\s*\[blocking\]/im;

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
    intentBody: string;
    nonGoalsBody: string;
    openQuestionsPresent: boolean;
    bodyText: string;
    links: readonly SpecLink[];
    // The deduped inline `[[KEY]]` citation keys the parser marked distinctly from `links` (C015).
    citations: readonly string[];
    // Id-shaped headings with a lowercase split-suffix (`AC-004a`) the parser refused as requirements (C019).
    malformedRequirementHeadings: readonly { heading: string; line: number }[];
}>;

export type Diagnostic = Readonly<{
    code: CheckId;
    severity: CheckSeverity;
    message: string;
    line: number | null;
}>;

// Diagnostic messages interpolate raw field values from the checked artifact (link targets, ids,
// task refs). A crafted artifact could smuggle ANSI/terminal escape sequences through them into the
// plain-text report a human reads (the `--json` path is escaped by JSON.stringify already), so C0
// control characters and DEL are stripped here — the one choke point every Diagnostic goes through.
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;

function diagnostic(code: CheckId, message: string, line: number | null): Diagnostic {
    return { code, severity: severity_of(code), message: message.replace(CONTROL_CHAR_PATTERN, ''), line };
}

// A path-shaped reference (resolve it, artifact-relative) vs a bare external tracker id like
// `JIRA-123` (exempt — naming it is C008's concern, not C009's).
export function is_path_ref(raw: string): boolean {
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
    // A path-shaped ref is a path (has a separator) or names a doc-like file by extension. A bare
    // name without either (a prose token, an unqualified cross-ref) is not resolvable here — bare
    // cross-ref id resolution is the file-set check's concern (C002), not a single-file path check.
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
                diagnostic(
                    'C003',
                    `requirement ${requirement.id} has no non-empty "Verify with:" line`,
                    requirement.line
                )
            );
        }
    }
    return diagnostics;
}

// --- C004 one-strength-word ----------------------------------------------------------------------
// ADR-0126 (contract 0.12.0): the requirement is AT LEAST one binding word — zero binds on nothing
// (the defect); more than one is a split-candidate ADVISORY under the same id, advice-framed, never
// "expected exactly one" (the exactly-one bar was the measured dominant authoring friction with no
// measured benefit).
export function check_one_strength_word(spec: ParsedSpec): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const isSol = spec.frontmatter.format === 'sol';
    for (const requirement of spec.requirements) {
        // C004 exempts SOL INTERFACE blocks (IF-): an INTERFACE is a signature
        // DECLARATION (`RETURNS`/`ACCEPTS`/`ERRORS`/`OWNED BY`, docs/reference/structured-requirements.md)
        // with no strength-word slot by grammar — so "add the one word it binds on" is un-actionable.
        // Only REQ/CONSTRAINT/INVARIANT bear an obligation; QUESTION (Q-) is already excluded at parse.
        if (requirement.id.startsWith('IF-')) {
            continue;
        }
        const count = count_strength_words(response_clause(statement_text(requirement.body), isSol));
        if (count === 0) {
            diagnostics.push(
                diagnostic(
                    'C004',
                    `requirement ${requirement.id} states no strength word — it binds on nothing; add the one word (MUST/SHOULD/…) it binds on`,
                    requirement.line
                )
            );
        } else if (count > 1) {
            diagnostics.push(
                diagnostic(
                    'C004',
                    `requirement ${requirement.id} states ${count} strength words — several bindings often mean several requirements; consider a split (advice, not a format bar)`,
                    requirement.line
                )
            );
        }
    }
    return diagnostics;
}

// --- C007 no-tbd-at-ready ------------------------------------------------------------------------
export function check_no_tbd_at_ready(spec: ParsedSpec): Diagnostic[] {
    if (spec.frontmatter.status !== 'ready') {
        return [];
    }
    const diagnostics: Diagnostic[] = [];
    if (UNRESOLVED_MARKER_PATTERN.test(spec.bodyText)) {
        diagnostics.push(diagnostic('C007', 'a TBD / TODO / ??? marker remains at status: ready', null));
    }
    if (BLOCKING_QUESTION_PATTERN.test(spec.bodyText)) {
        diagnostics.push(diagnostic('C007', 'an unresolved blocking open question remains at status: ready', null));
    }
    return diagnostics;
}

// --- C021 intent-present -------------------------------------------------------------------------
export function check_intent_present(spec: ParsedSpec): Diagnostic[] {
    return spec.intentBody.trim().length > 0
        ? []
        : [diagnostic('C021', 'spec must contain a non-empty `## Intent` section', null)];
}

export type TaskCheckRecord = Readonly<{
    type: string | null;
    id: string | null;
    source: readonly string[];
    scope: readonly string[];
    status: string | null;
    sectionTitles: readonly string[];
    verifyBody: string;
    resolutionText: string;
}>;

const TASK_STATUSES = new Set(['ready', 'running', 'review-ready', 'closed']);
const TASK_SECTIONS = [
    'Source',
    'Scope',
    'Do not change',
    'Affected areas',
    'Verify',
    'Agent instructions',
    'Findings',
    'Run summary',
] as const;

// --- C022 task-shape ----------------------------------------------------------------------------
export function check_task_shape(task: TaskCheckRecord): Diagnostic[] {
    const failures: string[] = [];
    if (task.type !== 'task') failures.push('`type:` must equal `task`');
    if (task.id === null || task.id.trim().length === 0) failures.push('`id:` must be a non-empty scalar');
    if (task.source.length === 0) failures.push('`source:` must be a non-empty list');
    if (task.scope.length === 0) failures.push('`scope:` must be a non-empty list');
    if (task.status === null || !TASK_STATUSES.has(task.status)) {
        failures.push('`status:` must be ready, running, review-ready, or closed');
    }
    const counts = new Map<string, number>();
    for (const title of task.sectionTitles) counts.set(title, (counts.get(title) ?? 0) + 1);
    for (const title of TASK_SECTIONS) {
        const count = counts.get(title) ?? 0;
        if (count === 0) failures.push(`missing \`## ${title}\``);
        if (count > 1) failures.push(`\`## ${title}\` appears more than once`);
    }
    return failures.length === 0 ? [] : [diagnostic('C022', failures.join('; '), null)];
}

// --- C023 task-evidence -------------------------------------------------------------------------
const GENERIC_COMPLETION_CLAIM = /^(?:all )?(?:tests?|checks?) (?:pass(?:ed)?|succeeded)\.?$/i;
const UNFILLED_FENCED_EVIDENCE = /^(?:pending|tbd|todo|\?\?\?|\{\{[^}\r\n]+\}\})\.?$/i;

type FencedEvidenceState = Readonly<{ hasOutput: boolean; hasPlaceholder: boolean }>;

// Inspect every fence. One valid output fence cannot hide a separate untouched placeholder fence.
// Placeholder words inside real logs remain raw output unless the whole fence is a template sentinel.
function inspect_fenced_evidence(lines: readonly string[]): FencedEvidenceState {
    let body: string[] | null = null;
    let hasOutput = false;
    let hasPlaceholder = false;
    for (const line of scan_markdown(lines)) {
        if (line.opensFence) {
            body = [];
            continue;
        }
        if (line.closesFence) {
            const trimmedBody = (body ?? []).join('\n').trim();
            const claimOnly = GENERIC_COMPLETION_CLAIM.test(trimmedBody);
            const placeholder = UNFILLED_FENCED_EVIDENCE.test(trimmedBody);
            hasPlaceholder ||= placeholder;
            if (trimmedBody.length > 0 && !claimOnly && !placeholder) {
                hasOutput = true;
            }
            body = null;
            continue;
        }
        if (line.inFence && body !== null) {
            body.push(line.text);
        }
    }
    return { hasOutput, hasPlaceholder };
}

export function check_task_evidence(task: TaskCheckRecord): Diagnostic[] {
    if (task.status !== 'review-ready' && task.status !== 'closed') {
        return [];
    }
    const verify = task.verifyBody.trim();
    const verifyLines = verify.split(/\r\n|[\r\n]/);
    const scannedVerify = scan_markdown(verifyLines);
    const visibleVerify = visible_text(scannedVerify);
    const nonFencedVerify = scannedVerify
        .filter((line) => !line.inFence)
        .map((line) => line.text)
        .join('\n');
    const fenced = inspect_fenced_evidence(verifyLines);
    const hasExitStatus = /^[ \t>*+-]*Exit status\s*:\s*\d+[ \t]*$/im.test(visibleVerify);
    const hasPastedOutput = hasExitStatus && fenced.hasOutput;
    const hasCiLink = /^[ \t>*+-]*(?:CI|CI link)\s*:\s*https?:\/\/\S+[ \t]*$/im.test(visibleVerify);
    const hasJustifiedNa = /\bn\/a\s*(?::|-)[ \t]*\S+/i.test(visibleVerify);
    const hasPlaceholder =
        fenced.hasPlaceholder || /\{\{[^}]+\}\}|\b(?:pending|tbd|todo)\b|\?\?\?/i.test(nonFencedVerify);
    return verify.length > 0 && !hasPlaceholder && (hasPastedOutput || hasCiLink || hasJustifiedNa)
        ? []
        : [
              diagnostic(
                  'C023',
                  'task `## Verify` must contain a numeric `Exit status:` plus non-claim-only fenced raw output, an explicit `CI:`/`CI link:` field, or `n/a` with a reason',
                  null
              ),
          ];
}

// --- C024 closed-task-resolved ------------------------------------------------------------------
export function check_closed_task_resolved(task: TaskCheckRecord): Diagnostic[] {
    if (task.status !== 'closed') return [];
    const unresolvedNamedBlocker = task.resolutionText.split(/\r\n|[\r\n]/).some((line) => {
        const match =
            /^[ \t>]*(?:[*+-]|\d+\.)[ \t]+(?:Blocking|Open question \(blocking\)|Blocked questions):[ \t]*(.*)$/i.exec(
                line
            );
        if (match === null) return false;
        const value = match[1].trim().toLowerCase();
        return value.length > 0 && value !== 'none' && value !== 'n/a';
    });
    return UNRESOLVED_MARKER_PATTERN.test(task.resolutionText) || unresolvedNamedBlocker
        ? [diagnostic('C024', 'closed task contains an unresolved blocking decision', null)]
        : [];
}

// --- C008 sources-named --------------------------------------------------------------------------
export function check_sources_named(spec: ParsedSpec): Diagnostic[] {
    if (spec.frontmatter.sources.length === 0) {
        return [diagnostic('C008', 'frontmatter sources: names no origin', null)];
    }
    return [];
}

// --- C009 broken-source-link ---------------------------------------------------------------------
// A spec's `sources:`/reference path must resolve — ARTIFACT-RELATIVE (ADR-0143 D4): the injected
// `exists` predicate is built against the spec's own directory, never a workspace root.
export type CheckBrokenLinksInput = Readonly<{
    spec: ParsedSpec;
    exists: (ref: string) => boolean;
}>;

export function check_broken_source_link(input: CheckBrokenLinksInput): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const frontmatterRefs: SpecLink[] = input.spec.frontmatter.sources.map((raw) => ({ raw, line: 0 }));
    for (const link of [...frontmatterRefs, ...input.spec.links]) {
        if (!is_path_ref(link.raw)) {
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
// A spec's inline `[[KEY]]` citation that resolves to no `<a id="KEY">` anchor in the sources.md
// its frontmatter names is surfaced as a C015 warning — a dangling citation (the "citations are
// contextual" discipline). PURE over the parsed record: the command injects
// `anchor_resolves: (key) => boolean`, built by reading the sources.md the spec's frontmatter
// `sources:` names — resolved against the spec's own directory (ADR-0143 D4) — and extracting its
// `<a id="…">` anchors (mirrors C009's injected `exists`).
//
// Skip-when-nothing-to-check (ADR-0087 Decision 3): if no sources.md is resolvable, the command
// passes `anchor_resolves = () => true`, so the check admits every key and never false-flags. C015
// fires only when a sources.md is resolvable AND a `[[KEY]]` has no matching anchor. v0 is the
// dangling-anchor case only; claim-quality checks (a MUST-level claim citing a caveated source)
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

// --- C019 malformed-requirement-heading ----------------------------------------------------------
// A `###` heading shaped like a requirement id but with a lowercase split-suffix (`AC-004a`) parses
// as plain prose — the requirement silently vanishes from scope and coverage. The warning makes the
// disappearance visible; the fix is a digits-only id (split requirements get their own numbers).
// (C018 stays reserved for the oversized-packet signal — ADR-0094/0097/0125.)
export function check_malformed_requirement_heading(spec: ParsedSpec): Diagnostic[] {
    return spec.malformedRequirementHeadings.map((entry) =>
        diagnostic(
            'C019',
            `\`### ${entry.heading}\` looks like a requirement id but has a lowercase split-suffix — it parses as prose and is invisible to scope/coverage; use a digits-only id`,
            entry.line
        )
    );
}

// --- C012 coverage (ADR-0079) --------------------------------------------------------------------
// The review-packet coverage reconcile: keyed on the task packet's declared `scope` as the in-scope
// id set, against the source spec's requirement ids and the coverage rows present in the review
// packet. Two faces, both `warning`:
//   - uncovered — an in-scope id with no coverage row (the dominant "not reviewed yet" signal).
//   - orphan    — a coverage row naming an id absent from the source spec (stale/mistyped id).
// Scope-guarded to non-draft source specs: a `draft` spec's ids are work-in-progress, so the check
// is exempt (mirrors C007's ready-state boundary). PURE — plain id sets in, diagnostics out; the engine
// (check_review_file) does the I/O and passes the extracted ids here.
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

// The message a coverage finding renders to — single-sourced, so every C012 Diagnostic shares the
// exact wording.
export function coverage_message(finding: CoverageFinding): string {
    return finding.kind === 'uncovered'
        ? `requirement ${finding.id} is in scope but has no coverage row (uncovered)`
        : `coverage row ${finding.id} names an id absent from the source spec (orphan)`;
}

// The structured C012 facts — the pure fact layer `check_coverage` builds its Diagnostics on. PURE;
// the draft scope guard lives here so everything built on the facts inherits it.
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

// --- C013 verify-evidence-binding (ADR-0083) -----------------------------------------------------
// The structured-evidence reconcile against the named source spec. A coverage row may carry a
// fenced `verify` block (a sibling to the row). Where present against a Supported row, this
// surfaces a CONSISTENCY fact: does the block's recorded `cmd` match the requirement's named
// `Verify with:` / `VERIFY BY` command (closed-value, exact after whitespace-collapse — never prose
// matching) and read `result=pass`? It is NEVER a verdict (ADR-0077 D8) and NEVER proof the command
// ran — the fenced body is self-reported and unparsed; this reads only the closed-value info-string.
//
// The five faces: cmd-mismatch is a hard error at check time; the other four remain warnings
// (ADR-0129 amending ADR-0083):
//   - cmd-mismatch    — a block's `cmd` disagrees with the requirement's named command.
//   - result-fail     — a `result=fail` block recorded under a Supported row.
//   - malformed       — a block whose info-string did not parse to a complete binding.
//   - duplicate       — more than one block keyed to the same requirement id.
//   - free-form-only  — a Supported row with no verify block (only the free-form cell; the fuzzy band,
//                       routed to human attention, never machine-rejected — SMELLS-precision).
// A Supported row whose block's `cmd` matches and reads `result=pass` is consistent → no finding.
// Scope-guarded to non-draft source specs (mirrors C012 / the ADR-0079 guard). PURE — plain records
// in, structured findings out; the engine (check_review_file) does the I/O and extraction.
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
    // The coverage rows (id + raw Assessment cell) — C013 keys on Supported rows.
    coverageRows: readonly { id: string; assessment: string }[];
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
// normalize identically or a conformant block false-fires a cmd-mismatch. The note is
// stripped before the backticks so the documented ``cmd`` (note) / ``cmd`` — note forms reduce cleanly to
// the bare command. The dash form keys on an EM/EN dash (—/–), never the ASCII hyphen, so a real flag
// like `npm test -- a.spec.ts` is never truncated.
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
            return `coverage row ${finding.id} is Supported but its verify block records result=fail`;
        case 'malformed':
            return `coverage row ${finding.id} carries a malformed verify block (its info-string did not parse to id / cmd / result)`;
        case 'duplicate':
            return `requirement ${finding.id} carries more than one verify block`;
        case 'free-form-only':
            // R5-I11: spell out that this is ADVISORY + how to silence it, so it doesn't read as "you
            // reviewed wrong". A prose Evidence cell can't be machine-matched, so it routes to a human.
            return `coverage row ${finding.id} is Supported with only a free-form Evidence cell (advisory — add a \`verify\` block to machine-confirm, or leave as-is to route to a human)`;
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
    // `(unkeyed)` malformed block is already surfaced in the indexing loop). The Supported-row loop below
    // therefore no longer re-emits malformed (#32).
    const seenMalformed = new Set<string>();
    for (const [id, blocks] of blocksById) {
        if (blocks.some((block) => block.malformed) && !seenMalformed.has(id)) {
            seenMalformed.add(id);
            findings.push({ id, kind: 'malformed' });
        }
    }

    for (const row of input.coverageRows) {
        if (row.assessment !== 'Supported') {
            continue;
        }
        const blocks = blocksById.get(row.id) ?? [];
        if (blocks.length === 0) {
            // A Supported row with no verify block — the free-form-only warning (fuzzy band, ADR-0083).
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
    return verify_binding_facts(input).map((finding) => {
        const base = diagnostic('C013', verify_binding_message(finding), null);
        // #95 (ADR-0129 amends ADR-0083; severity expressed at check time, ADR-0143 D7): a
        // cmd-mismatch BLOCKS — a recorded verify block whose cmd disagrees with the requirement's
        // named Verify command is a structural contradiction (a fabricated/renamed command name),
        // not a nudge, so ship it hard-error here. The other C013 kinds stay advisory (warning);
        // verify_binding_facts stays the pure fact layer this check builds on (ADR-0077 D8: a
        // severity level, never a verdict).
        return finding.kind === 'cmd-mismatch' ? { ...base, severity: 'hard-error' as const } : base;
    });
}

// --- C016 supported-needs-evidence (ADR-0097; the implemented supported-needs-evidence content_rule) --------
// A coverage row recorded as `Supported` whose Evidence cell is empty is a STRUCTURAL contradiction: a
// Supported needs pasted output, a CI link, or (for a manual Verify) a named human's recorded observation
// — an empty cell reads Unverified, never Supported. Unlike C012/C013 (judgment-laden facts shipped at
// warning), this is unambiguous, so the contract pins it hard-error and `suspec check` blocks on it
// (severity expressed at check time, ADR-0143 D7). PURE: the row records in, ids/diagnostics out.
export type CoverageEvidenceRow = Readonly<{ id: string; assessment: string; evidence: string }>;

// The single source for "a Supported row with no evidence" — the C016 Diagnostic (below) renders exactly
// these ids, so the predicate and the diagnostic can never disagree on what counts.
export function supported_rows_missing_evidence(rows: readonly CoverageEvidenceRow[]): string[] {
    return rows
        .filter((row) => row.assessment === 'Supported' && row.evidence.trim().length === 0)
        .map((row) => row.id);
}

export function check_supported_evidence(rows: readonly CoverageEvidenceRow[]): Diagnostic[] {
    return supported_rows_missing_evidence(rows).map((id) =>
        diagnostic(
            'C016',
            `coverage row ${id} is Supported with an empty Evidence cell — Supported needs pasted output, a CI link, or a named manual observation (an empty cell reads Unverified)`,
            null
        )
    );
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
    // Whether the named spec exists and defines the anchor (injected from bounded sibling candidates).
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

// --- The single-file runner and aggregate level --------------------------------------------------
export type RunSpecChecksInput = Readonly<{
    spec: ParsedSpec;
    exists: (ref: string) => boolean;
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
        ...check_no_tbd_at_ready(input.spec),
        ...check_intent_present(input.spec),
        ...check_sources_named(input.spec),
        ...check_broken_source_link({ spec: input.spec, exists: input.exists }),
        ...check_citation_resolves(input.spec, anchor_resolves),
        ...check_malformed_requirement_heading(input.spec),
    ];
}

// Aggregate diagnostics to one outcome level: any hard-error → blocking, else any warning → warning,
// else clean (AC-005 exit mapping).
export function level_for(diagnostics: readonly Diagnostic[]): OutcomeLevel {
    if (diagnostics.some((entry) => entry.severity === 'hard-error')) {
        return 'blocking';
    }
    if (diagnostics.length > 0) {
        return 'warning';
    }
    return 'clean';
}
