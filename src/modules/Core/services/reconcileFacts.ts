// The pure reconcile logic for `swarm review` (M2, AC-018/019/020/021): plain data in, facts out —
// no I/O, no verdict. The engine (reconcileReview) does the filesystem/git reads and hands the
// extracted records here; this service owns the set-difference + packet-structure semantics, the way
// checksContract owns the spec-rule semantics. Forbidden to other modules (a Core service, private
// by the dependency-cruiser private-internals rule).
//
// The boundary (ADR-0077 Decision 8) is structural here: this module surfaces FACTS — uncovered ids,
// orphan rows, mismatched files, malformed cells — and never a Pass/Fail/Unverified/Blocked review
// result, never a packet `status: pass`, never a merge decision.

// --- The review-packet shape the structural checks key on (the parser produces it) --------------

export type CoverageRow = Readonly<{
    id: string;
    result: string; // the raw Result cell value (Pass / Fail / … / a malformed value)
    evidence: string; // the raw Evidence cell value (empty = unverified-when-Pass)
}>;

// A structured-evidence `verify` block (ADR-0083), parsed from a coverage row's optional fenced
// sibling: the closed-value info-string only — `id` / `cmd` / `result` (`pass` | `fail`). The fenced
// BODY is deliberately never captured here: it is verbatim, self-reported, and unparsed (C013 reads a
// consistency fact off the info-string, never a verdict off the body). A block whose info-string does
// not parse to all three closed-value fields is surfaced as `malformed` rather than silently dropped
// (AC-004), carrying whatever id it could read so the fact can be routed to a row.
export type VerifyBlock = Readonly<{
    id: string | null; // the keyed requirement id, or null when the info-string named none
    cmd: string | null; // the recorded command, or null when absent/unquoted
    result: 'pass' | 'fail' | null; // the closed-value pass signal, or null when absent/out-of-enum
    malformed: boolean; // the info-string did not parse to a complete, well-formed binding
}>;

export type ReviewPacket = Readonly<{
    status: string | null; // frontmatter status (or null when absent)
    sectionTitles: readonly string[];
    coverageRows: readonly CoverageRow[];
    verifyBlocks: readonly VerifyBlock[]; // the structured-evidence blocks in the coverage section
}>;

// The closed sets the structural checks (AC-021) reconcile against — the review packet's contract
// (checks.yaml review_file): the four coverage Results and the five frontmatter statuses.
export const COVERAGE_RESULTS = ['Pass', 'Fail', 'Unverified', 'Blocked'] as const;
export const REVIEW_STATUSES = ['draft', 'pass', 'waived', 'blocked', 'needs-human'] as const;
// Sections a well-formed review packet presents (checks.yaml review_file.required_sections).
export const REQUIRED_REVIEW_SECTIONS = [
    'Summary',
    'Changed files',
    'Requirement coverage',
    'Human attention',
    'Suggested decision',
] as const;

// --- The self-report ↔ diff reconcile (AC-018) ---------------------------------------------------
// Three mismatch classes, using the declared scope/affected-areas as ground truth. Each is surfaced;
// none is judged acceptable here.
export type SelfReportMismatch = Readonly<{
    claimedNotInDiff: readonly string[]; // Run summary claims it changed; the diff does not show it
    inDiffNotClaimed: readonly string[]; // the diff shows it changed; the Run summary never mentions it
    outsideScope: readonly string[]; // a changed path outside the declared Affected-areas scope
    // The Run summary listed no machine-checkable file paths while the diff did change files (swarm-hq
    // #44): a prose summary that can't be reconciled. The `inDiffNotClaimed` flood is suppressed and
    // this is surfaced once instead — an informational note, not a finding (it never trips the level).
    runSummaryUnparsed: boolean;
}>;

export type SelfReportInput = Readonly<{
    claimedChangedFiles: readonly string[];
    diffChangedFiles: readonly string[];
    // The declared Affected-areas path prefixes (ground truth for "in scope"). A changed path is
    // outside scope when it is under none of these. Empty = no declared areas → nothing is "outside".
    affectedAreas: readonly string[];
}>;

function difference(a: readonly string[], b: readonly string[]): string[] {
    const bSet = new Set(b);
    return [...new Set(a)].filter((value) => !bSet.has(value)).sort();
}

function is_under_any_area(path: string, areas: readonly string[]): boolean {
    if (areas.length === 0) {
        return true; // no declared areas → treat everything as in scope (nothing surfaced as outside)
    }
    return areas.some((area) => path === area || path.startsWith(area.endsWith('/') ? area : `${area}/`));
}

export function reconcile_self_report(input: SelfReportInput): SelfReportMismatch {
    // A prose Run summary parses to zero claimed paths; reconciling it against a non-empty diff would
    // flag every changed file as `inDiffNotClaimed` (the swarm-hq #44 flood). When there is nothing
    // machine-checkable to reconcile against, suppress that class and surface a single note instead.
    // `outsideScope` is independent of the claim set (diff vs Affected areas), so it still computes.
    const runSummaryUnparsed = input.claimedChangedFiles.length === 0 && input.diffChangedFiles.length > 0;
    return {
        claimedNotInDiff: difference(input.claimedChangedFiles, input.diffChangedFiles),
        inDiffNotClaimed: runSummaryUnparsed ? [] : difference(input.diffChangedFiles, input.claimedChangedFiles),
        outsideScope: [...new Set(input.diffChangedFiles)]
            .filter((path) => !is_under_any_area(path, input.affectedAreas))
            .sort(),
        runSummaryUnparsed,
    };
}

// --- The do-not-change-touched fact (C014, ADR-0086) ---------------------------------------------
// A changed file matching a task's `## Do not change` entry is surfaced — distinct from `outsideScope`,
// since a protected path may lie INSIDE the declared Affected areas. Matched PER-ENTRY: an empty
// Do-not-change list must surface nothing, whereas `is_under_any_area([])` returns true ("everything in
// scope") — the inverse of what is wanted here. So `.some` over the entries yields false on an empty list.
export function do_not_change_touched(
    diffChangedFiles: readonly string[],
    doNotChange: readonly string[]
): string[] {
    return [...new Set(diffChangedFiles)]
        .filter((path) => doNotChange.some((entry) => is_under_any_area(path, [entry])))
        .sort();
}

// --- The scope ↔ spec divergence (AC-019, D-R06) -------------------------------------------------
// When the task's declared `scope` names an id the source spec does not define, surface it (the
// divergence is a fact, not silently resolved). Returns the scope ids absent from the spec.
export function scope_divergence(scopeIds: readonly string[], specRequirementIds: readonly string[]): string[] {
    return difference(scopeIds, specRequirementIds);
}

// --- The empty-Evidence Pass rows (AC-020) -------------------------------------------------------
// A coverage row whose Result is Pass but whose Evidence cell is empty reads Unverified — the fact is
// surfaced (the cell is never rewritten).
export function empty_evidence_pass_rows(rows: readonly CoverageRow[]): string[] {
    return rows.filter((row) => row.result === 'Pass' && row.evidence.trim().length === 0).map((row) => row.id);
}

// --- The packet-structural facts (AC-021) --------------------------------------------------------
export type PacketStructuralFacts = Readonly<{
    badResultCells: readonly string[]; // coverage row ids whose Result is outside the closed set
    badStatus: string | null; // a frontmatter status outside the closed set (the offending value)
    statusPassContradicted: boolean; // status: pass but a coverage row is not Pass
    missingSections: readonly string[]; // required sections the packet does not present
}>;

export function packet_structural_facts(packet: ReviewPacket): PacketStructuralFacts {
    const resultSet = new Set<string>(COVERAGE_RESULTS);
    const statusSet = new Set<string>(REVIEW_STATUSES);
    const sectionSet = new Set(packet.sectionTitles.map((title) => title.toLowerCase()));

    const badResultCells = packet.coverageRows.filter((row) => !resultSet.has(row.result)).map((row) => row.id);
    const badStatus = packet.status !== null && !statusSet.has(packet.status) ? packet.status : null;
    // A `status: pass` must be backed by at least one row and every row Pass. Zero rows is a vacuous
    // pass (no evidence at all) — strictly worse than one non-Pass row — so it is also a contradiction (#32).
    const statusPassContradicted =
        packet.status === 'pass' &&
        (packet.coverageRows.length === 0 || packet.coverageRows.some((row) => row.result !== 'Pass'));
    const missingSections = REQUIRED_REVIEW_SECTIONS.filter(
        (section) => !sectionSet.has(section.toLowerCase())
    );

    return { badResultCells, badStatus, statusPassContradicted, missingSections };
}
