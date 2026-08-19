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
export const CONTRACT_VERSION = '0.26.0';

export type CheckSeverity = 'hard-error' | 'warning';

// prettier-ignore
export type CheckId =
    | 'C001' | 'C002' | 'C003' | 'C004'
    | 'C007' | 'C008' | 'C009' | 'C010' | 'C011' | 'C015'
    | 'C019' | 'C021' | 'C022' | 'C023' | 'C024' | 'C025'
    | 'C028' | 'C029' | 'C030' | 'C031';

// Severity per check, the single source inside suspec-cli; a total Record so the lookup needs no
// fallback. The drift guard reconciles it against suspec/checks/checks.yaml.
const SEVERITY_BY_ID: Record<CheckId, CheckSeverity> = {
    C001: 'hard-error',
    C002: 'hard-error',
    C003: 'hard-error',
    C004: 'hard-error',
    C007: 'hard-error',
    C008: 'warning',
    C009: 'hard-error',
    C010: 'hard-error',
    C011: 'warning',
    C015: 'warning',
    C019: 'warning',
    C021: 'hard-error',
    C022: 'hard-error',
    C023: 'hard-error',
    C024: 'hard-error',
    C025: 'hard-error',
    C028: 'hard-error',
    C029: 'hard-error',
    C030: 'hard-error',
    C031: 'hard-error',
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
    { id: 'C015', name: 'citation-resolves', severity: severity_of('C015') },
    { id: 'C019', name: 'malformed-requirement-heading', severity: severity_of('C019') },
    { id: 'C021', name: 'intent-present', severity: severity_of('C021') },
    { id: 'C022', name: 'task-shape', severity: severity_of('C022') },
    { id: 'C023', name: 'task-evidence', severity: severity_of('C023') },
    { id: 'C024', name: 'closed-task-resolved', severity: severity_of('C024') },
    { id: 'C025', name: 'spec-shape', severity: severity_of('C025') },
    { id: 'C028', name: 'requirement-shape', severity: severity_of('C028') },
    { id: 'C029', name: 'campaign-shape', severity: severity_of('C029') },
    { id: 'C030', name: 'campaign-authority', severity: severity_of('C030') },
    { id: 'C031', name: 'campaign-ready', severity: severity_of('C031') },
];

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

// Longest first so negative forms count once.
const STRENGTH_WORDS = ['MUST NOT', 'MUST', 'SHOULD NOT', 'SHOULD', 'MAY'] as const;

const STRENGTH_WORD_PATTERN = new RegExp(`\\b(?:${STRENGTH_WORDS.join('|')})\\b`, 'g');

const WHEN_LINE_PATTERN = /^- When:[ \t]+\S.*$/;
const THEN_LINE_PATTERN = /^- Then:[ \t]+\S.*$/;
const THEN_VALUE_PATTERN = /^- Then:[ \t]*(.*\S)?[ \t]*$/m;
const VERIFY_LINE_PATTERN = /^- Verify with:[ \t]+\S.*$/;
const VERIFY_ITEM_PATTERN = /^- Verify with:[ \t]*(?:\S.*)?$/;

// At `status: ready`, none of these may remain (C007). At draft they are fine.
const UNRESOLVED_MARKER_PATTERN = /\b(?:TBD|TODO)\b|\?\?\?/;

const BLOCKING_QUESTION_PATTERN = /^(?:[ \t]*(?:>|[-+*]|\d{1,9}[.)])[ \t]+)*[ \t]*Blocking:/im;

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

function response_text(body: string): string {
    return THEN_VALUE_PATTERN.exec(body)?.[1]?.trim() ?? '';
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
        const lines = requirement.body.split('\n').map((line) => line.trimEnd());
        if (!lines.some((line) => VERIFY_LINE_PATTERN.test(line))) {
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
export function check_one_strength_word(spec: ParsedSpec): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const requirement of spec.requirements) {
        const count = count_strength_words(response_text(requirement.body));
        if (count !== 1) {
            diagnostics.push(
                diagnostic(
                    'C004',
                    `requirement ${requirement.id} \`Then\` must state exactly one strength word (MUST/MUST NOT/SHOULD/SHOULD NOT/MAY); found ${count}`,
                    requirement.line
                )
            );
        }
    }
    return diagnostics;
}

export function check_requirement_shape(spec: ParsedSpec): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const requirement of spec.requirements) {
        const lines = requirement.body
            .split('\n')
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        if (
            lines.length !== 3 ||
            !WHEN_LINE_PATTERN.test(lines[0] ?? '') ||
            !THEN_LINE_PATTERN.test(lines[1] ?? '') ||
            !VERIFY_ITEM_PATTERN.test(lines[2] ?? '')
        ) {
            diagnostics.push(
                diagnostic(
                    'C028',
                    `requirement ${requirement.id} must contain exactly three items: non-empty \`- When:\`, non-empty \`- Then:\`, then \`- Verify with:\``,
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

const SPEC_STATUSES = new Set(['draft', 'ready']);

export function check_spec_shape(spec: ParsedSpec): Diagnostic[] {
    const failures: string[] = [];
    if (spec.frontmatter.type !== 'spec') failures.push('`type:` must equal `spec`');
    if (spec.frontmatter.id === null || spec.frontmatter.id.trim().length === 0) {
        failures.push('`id:` must be a non-empty scalar');
    }
    if (spec.frontmatter.status === null || !SPEC_STATUSES.has(spec.frontmatter.status)) {
        failures.push('`status:` must be draft or ready');
    }
    const counts = new Map<string, number>();
    for (const title of spec.sectionTitles) counts.set(title, (counts.get(title) ?? 0) + 1);
    for (const title of ['Intent', 'Requirements']) {
        const count = counts.get(title) ?? 0;
        if (count === 0) failures.push(`missing \`## ${title}\``);
        if (count > 1) failures.push(`\`## ${title}\` appears more than once`);
    }
    if (spec.requirements.length === 0) failures.push('`## Requirements` must contain at least one requirement');
    return failures.length === 0 ? [] : [diagnostic('C025', failures.join('; '), null)];
}

export type TaskCheckRecord = Readonly<{
    type: string | null;
    id: string | null;
    source: readonly string[];
    scope: readonly string[];
    status: string | null;
    sectionTitles: readonly string[];
    verifyBody: string;
    runOrderBody: string;
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
    'Run order',
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
    for (const label of ['Starts after', 'May run with']) {
        const match = new RegExp(`(?:^|\\n)[ \\t]*(?:[-*+][ \\t]+)?${label}:[ \\t]*([^\\r\\n]*)$`, 'im').exec(
            task.runOrderBody
        );
        if (match === null || match[1].trim().length === 0)
            failures.push(`\`## Run order\` needs non-empty \`${label}:\``);
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

export type CampaignCheckRecord = Readonly<{
    frontmatter: Readonly<{
        type: string | null;
        id: string | null;
        status: string | null;
        ledger: string | null;
        sources: readonly string[];
    }>;
    sectionTitles: readonly string[];
    sectionBodies: Readonly<Record<string, string>>;
    bodyText: string;
    taskListLines: readonly number[];
}>;

const CAMPAIGN_REQUIRED_SECTIONS = [
    'Objective',
    'Completion contract',
    'Authorities',
    'Operating loop',
    'Stops',
] as const;

// --- C029 campaign-shape ------------------------------------------------------------------------
export function check_campaign_shape(campaign: CampaignCheckRecord): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const { frontmatter } = campaign;
    if (frontmatter.type !== 'campaign') {
        diagnostics.push(diagnostic('C029', 'campaign must declare `type: campaign`', null));
    }
    if (frontmatter.id === null || frontmatter.id.trim().length === 0) {
        diagnostics.push(diagnostic('C029', 'campaign must declare a non-empty `id:`', null));
    }
    if (frontmatter.status !== 'draft' && frontmatter.status !== 'ready') {
        diagnostics.push(diagnostic('C029', 'campaign `status:` must be `draft` or `ready`', null));
    }
    if (frontmatter.ledger === null || frontmatter.ledger.trim().length === 0) {
        diagnostics.push(diagnostic('C029', 'campaign must declare a non-empty `ledger:`', null));
    }
    if (frontmatter.sources.length === 0 || frontmatter.sources.some((source) => source.trim().length === 0)) {
        diagnostics.push(diagnostic('C029', 'campaign must declare a non-empty `sources:` list', null));
    }
    for (const title of CAMPAIGN_REQUIRED_SECTIONS) {
        const count = campaign.sectionTitles.filter((candidate) => candidate === title).length;
        if (count !== 1) {
            diagnostics.push(diagnostic('C029', `campaign must contain exactly one \`## ${title}\` section`, null));
        } else if ((campaign.sectionBodies[title] ?? '').trim().length === 0) {
            diagnostics.push(diagnostic('C029', `campaign \`## ${title}\` section must not be empty`, null));
        }
    }
    return diagnostics;
}

// --- C030 campaign-authority --------------------------------------------------------------------
export function check_campaign_authority(
    campaign: CampaignCheckRecord,
    exists: (ref: string) => boolean
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const refs = [campaign.frontmatter.ledger, ...campaign.frontmatter.sources].filter(
        (ref): ref is string => ref !== null && ref.trim().length > 0
    );
    for (const ref of refs) {
        if (is_path_ref(ref) && !exists(ref)) {
            diagnostics.push(diagnostic('C030', `campaign authority does not resolve artifact-relative: ${ref}`, null));
        }
    }
    for (const line of campaign.taskListLines) {
        diagnostics.push(
            diagnostic('C030', 'campaign duplicates mutable ledger state in a Markdown task-list checkbox', line)
        );
    }
    return diagnostics;
}

// --- C031 campaign-ready ------------------------------------------------------------------------
export function check_campaign_ready(campaign: CampaignCheckRecord): Diagnostic[] {
    if (campaign.frontmatter.status !== 'ready') return [];
    const unresolvedNamedBlocker = campaign.bodyText.split(/\r\n|[\r\n]/).some((line) => {
        const match =
            /^[ \t>]*(?:[*+-]|\d+\.)[ \t]+(?:Blocking|Open question \(blocking\)|Blocked questions):[ \t]*(.*)$/i.exec(
                line
            );
        if (match === null) return false;
        const value = match[1].trim().toLowerCase();
        return value.length > 0 && value !== 'none' && value !== 'n/a';
    });
    return UNRESOLVED_MARKER_PATTERN.test(campaign.bodyText) || unresolvedNamedBlocker
        ? [diagnostic('C031', 'ready campaign contains an unresolved blocking decision', null)]
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
        ...check_requirement_shape(input.spec),
        ...check_verify_with(input.spec),
        ...check_one_strength_word(input.spec),
        ...check_no_tbd_at_ready(input.spec),
        ...check_intent_present(input.spec),
        ...check_spec_shape(input.spec),
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
