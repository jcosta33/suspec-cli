// CheckEngine, workspace scope (AC-006/AC-007): parse every specs/*/spec.md, run the core checks
// over each, add the cross-file checks (C002 duplicate ids) and workspace-validity findings
// (clause (a): an unfilled {{placeholder}} in a live AGENTS.md/board; clause (b): missing core
// templates), and aggregate to one repo verdict — the CI merge-gate surface. Reuses the same
// parse + rule functions as the single-spec engine, so both forms agree. Reads the filesystem;
// writes nothing.

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { run_spec_checks, verdict_for, type Diagnostic } from '../services/checksContract.ts';
import { find_orphaned_references } from '../services/skillWalker.ts';
import { check_change_plan } from './checkChangePlan.ts';
import { build_spec_ref_resolver } from './resolveSpecRef.ts';
import { build_anchor_resolver } from './buildAnchorResolver.ts';
import { build_source_exists } from './resolveSourcePath.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type WorkspaceFinding = Readonly<{
    code:
        | 'C002'
        | 'C017'
        | 'placeholder'
        | 'missing-template'
        | 'agents-oversize'
        | 'supersede-unresolved'
        | 'supersede-missing-pointer'
        | 'duplicate-content'
        | 'unpromoted-finding'
        | 'incomplete-execution-digest'
        | 'active-spec-no-execution';
    // SW-006: an unfilled {{placeholder}} in a freshly-scaffolded AGENTS.md is a "finish setup" nudge,
    // not broken work — it must NOT block the gate on day one (the kit's own AGENTS.md ships with
    // placeholders, so `corpus check` right after `corpus init` would otherwise greet a new user with a
    // red blocking verdict on boilerplate). A duplicate id (C002) or a missing templates/ tree is a
    // real structural defect and stays blocking.
    level: 'blocking' | 'warning';
    message: string;
}>;

export type WorkspaceSpecResult = Readonly<{
    path: string;
    level: OutcomeLevel;
    diagnostics: readonly Diagnostic[];
}>;

export type WorkspaceCheckReport = Readonly<{
    level: OutcomeLevel;
    verdict: 'clean' | 'blocking';
    specs: readonly WorkspaceSpecResult[];
    // The change-plan files' C010/C011 results, folded into the repo verdict alongside the specs
    // (AC-006). Shares the WorkspaceSpecResult shape (path + level + diagnostics).
    changePlans: readonly WorkspaceSpecResult[];
    workspaceFindings: readonly WorkspaceFinding[];
}>;

export type CheckWorkspaceInput = Readonly<{
    workspaceDir: string;
    // `--no-workspace`: lint the specs but skip workspace-validity (the AGENTS.md placeholder + the
    // missing-templates checks), for running against a bare specs/ tree without a full kit workspace.
    includeValidity?: boolean;
}>;

const PLACEHOLDER = /\{\{[^}]+\}\}/;
// The AGENTS.md size band — deliberately generous (~4× the ~100-line convention) so it is 0-FP on a
// real bootloader and only warns on genuine bloat. Lines is the primary signal (the convention is
// line-stated); bytes is a backstop for a few-but-enormous-line file.
const AGENTS_MAX_LINES = 400;
const AGENTS_MAX_BYTES = 24576; // 24 KB

function find_spec_files(workspaceDir: string): string[] {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return [];
    }
    const out: string[] = [];
    for (const entry of readdirSync(specsDir)) {
        const specPath = join(specsDir, entry, 'spec.md');
        if (existsSync(specPath)) {
            out.push(specPath);
        }
    }
    return out.sort();
}

// The change-plan files under `<workspaceDir>/change-plans/` (sorted). Change plans live at the
// workspace root's `change-plans/` dir (kit layout); only `type: change-plan` files run C010/C011.
function find_change_plan_files(workspaceDir: string): string[] {
    const dir = join(workspaceDir, 'change-plans');
    if (!existsSync(dir)) {
        return [];
    }
    const out: string[] = [];
    for (const entry of readdirSync(dir).sort()) {
        const path = join(dir, entry);
        if (
            entry.endsWith('.md') &&
            existsSync(path) &&
            /^type:\s*change-plan\s*$/m.test(
                readFileSync(path, 'utf8')
                    .split(/\r\n|[\r\n]/)
                    .slice(0, 12)
                    .join('\n')
            )
        ) {
            out.push(path);
        }
    }
    return out;
}

// Duplicate-content advisory (ADR-0106 item 3; ADR-0096 §3.5 — duplication is the dominant durable
// failure). v0 = EXACT duplicates only: findings whose body (frontmatter stripped, whitespace
// collapsed) is identical. Deterministic 0-FP by construction — identical text is identical, no
// similarity heuristic (fuzzy/near-duplicate detection needs a measured threshold; deferred). Returns
// each group of ≥2 workspace-relative finding paths that share one normalized body.
function find_duplicate_findings(workspaceDir: string): string[][] {
    const dir = join(workspaceDir, 'findings');
    if (!existsSync(dir)) {
        return [];
    }
    const byBody = new Map<string, string[]>();
    for (const name of readdirSync(dir).sort()) {
        if (!name.endsWith('.md') || name === 'README.md') {
            continue; // a README placeholder is never a finding
        }
        // Strip a leading frontmatter fence, then collapse all whitespace, so two findings differing
        // only in frontmatter/spacing still count as the same body. An empty body never duplicates.
        const body = readFileSync(join(dir, name), 'utf8')
            .replace(/^---\n[\s\S]*?\n---\n/, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (body.length === 0) {
            continue;
        }
        byBody.set(body, [...(byBody.get(body) ?? []), `findings/${name}`]);
    }
    return [...byBody.values()].filter((paths) => paths.length > 1);
}

// The finding-candidate slugs a spec's `## Execution` declares (a `Finding candidates: slug-a, slug-b`
// line) — the durable lessons the run flagged. promotion-or-die (ADR-0106 item 6): each must land in
// findings/<slug>.md, else the lesson evaporated with the ephemeral run. 0-FP by construction — only an
// explicitly-NAMED slug is checked; un-named work is never flagged. Read-only (never writes the board).
function finding_candidates(source: string): string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    let inExecution = false;
    const out: string[] = [];
    for (const line of lines) {
        const heading = /^##\s+(.*\S)\s*$/.exec(line);
        if (heading !== null) {
            inExecution = /^execution$/i.test(heading[1].trim());
            continue;
        }
        if (!inExecution) {
            continue;
        }
        const match = /^[-*\s]*finding candidates?:\s*(.+)$/i.exec(line.trim());
        // Skip an unfilled template line (a `{{placeholder}}`) wholesale. The list is COMMA-separated —
        // split on comma (not whitespace) so a prose phrase collapses to one token that then fails the
        // slug shape. Validate each is a clean filename slug (alphanumeric / hyphen / underscore — no
        // spaces, slashes, dots, or `..`). This keeps the advisory 0-FP: prose, path components, and
        // placeholders never read as candidate slugs (so existsSync never sees an escaping path either).
        if (match !== null && !match[1].includes('{{')) {
            for (const raw of match[1].split(',')) {
                const slug = raw.trim().replace(/`/g, '');
                if (/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) {
                    out.push(slug);
                }
            }
        }
    }
    return out;
}

// Incomplete-execution-digest advisory (ADR-0110): a `## Execution` change-cycle entry carrying ONE
// staleness pin (`reviewed-sha:` / `evidence-hash:`) but not the other is a half-written stamp. 0-FP by
// construction — an entry with NEITHER pin is a prose/legacy entry (allowed), an entry with BOTH is a
// complete digest, only the XOR is flagged; a pin counts only when FILLED (a `{{placeholder}}` value does
// not count, so a freshly-scaffolded spec never trips). An entry is a top-level `- ` bullet under
// `## Execution`; its indented sub-bullets belong to it. Returns the dated labels of half-stamped entries.
function incomplete_execution_digests(source: string): string[] {
    const lines = source.split(/\r\n|[\r\n]/);
    let inExecution = false;
    let label: string | null = null;
    let hasSha = false;
    let hasHash = false;
    const out: string[] = [];
    const real_pin = (rest: string): boolean => {
        const value = rest.trim();
        return value.length > 0 && !value.includes('{{');
    };
    const flush = (): void => {
        if (label !== null && hasSha !== hasHash) {
            out.push(label);
        }
        label = null;
        hasSha = false;
        hasHash = false;
    };
    for (const line of lines) {
        const heading = /^##\s+(.*\S)\s*$/.exec(line);
        if (heading !== null) {
            flush();
            inExecution = /^execution$/i.test(heading[1].trim());
            continue;
        }
        if (!inExecution) {
            continue;
        }
        // A non-indented `- ` bullet opens a new entry; close the previous one first.
        if (/^-\s+/.test(line)) {
            flush();
            label = line.replace(/^-\s+/, '').trim();
        }
        // Pins may sit on the entry line or an indented sub-bullet; read up to the `·` separator.
        const sha = /reviewed[-_]sha:\s*([^·|]*)/i.exec(line);
        if (sha !== null && real_pin(sha[1])) {
            hasSha = true;
        }
        const hash = /evidence[-_]hash:\s*([^·|]*)/i.exec(line);
        if (hash !== null && real_pin(hash[1])) {
            hasHash = true;
        }
    }
    flush();
    return out;
}

function workspace_validity(workspaceDir: string): WorkspaceFinding[] {
    const findings: WorkspaceFinding[] = [];
    for (const liveFile of ['AGENTS.md', 'status.md']) {
        const path = join(workspaceDir, liveFile);
        if (!existsSync(path)) {
            continue;
        }
        const lines = readFileSync(path, 'utf8').split('\n');
        const hitLines = lines.map((line, index) => (PLACEHOLDER.test(line) ? index + 1 : 0)).filter((n) => n > 0);
        if (hitLines.length > 0) {
            const where = hitLines.length === 1 ? `line ${hitLines[0]}` : `lines ${hitLines.join(', ')}`;
            findings.push({
                code: 'placeholder',
                level: 'warning',
                message: `${liveFile} still has the kit's {{placeholder}}s (${where}) — fill them in before relying on the workspace`,
            });
        }
    }
    if (!existsSync(join(workspaceDir, 'templates'))) {
        findings.push({
            code: 'missing-template',
            level: 'blocking',
            message: 'no templates/ directory — the core templates are missing',
        });
    }
    // AGENTS.md is the always-loaded context file; the convention is to keep it short (~100 lines) so
    // every task pays a small, fixed context cost (glossary: AGENTS.md). A file several times that is
    // bloat the agent re-reads every run. The band is GENEROUS — ~4× the convention — so a real
    // bootloader (measured 45–101 lines, 3–6 KB) never trips it; only genuine bloat warns. A nudge
    // (warning), never blocking — an oversized but valid AGENTS.md is still a working workspace.
    const agentsPath = join(workspaceDir, 'AGENTS.md');
    if (existsSync(agentsPath)) {
        // Gate on the file size FIRST (a cheap stat) before reading — a pathological multi-GB AGENTS.md
        // would otherwise OOM the very check meant to flag bloat. Over the byte band we already know it
        // is oversize and warn on the KB measure without slurping the whole file; only a within-band
        // file (≤24 KB) is read to count lines.
        const byteCount = statSync(agentsPath).size;
        if (byteCount > AGENTS_MAX_BYTES) {
            findings.push({
                code: 'agents-oversize',
                level: 'warning',
                message: `AGENTS.md is ${Math.round(byteCount / 1024)} KB — the always-loaded context file should stay short; move depth into the guides it points to`,
            });
        } else {
            const lineCount = readFileSync(agentsPath, 'utf8').split('\n').length;
            if (lineCount > AGENTS_MAX_LINES) {
                findings.push({
                    code: 'agents-oversize',
                    level: 'warning',
                    message: `AGENTS.md is ${lineCount} lines (convention: ~100) — the always-loaded context file should stay short; move depth into the guides it points to`,
                });
            }
        }
    }
    return findings;
}

export function check_workspace(input: CheckWorkspaceInput): Result<WorkspaceCheckReport, AppError> {
    const specFiles = find_spec_files(input.workspaceDir);

    const specs: WorkspaceSpecResult[] = [];
    const frontmatterIdToPaths = new Map<string, string[]>();
    // Supersession pointers collected during the spec pass, resolved AFTER it (a `superseded_by` may
    // name a spec that appears later in the sort order). ADR-0106 item 4 / ADR-0108.
    const supersessions: { path: string; supersededBy: string | null; status: string | null }[] = [];
    // Finding candidates a spec's `## Execution` declares, resolved AFTER the pass against findings/.
    const candidatesBySpec: { path: string; slugs: readonly string[] }[] = [];
    // Half-stamped `## Execution` entries (ADR-0110) — one staleness pin without the other.
    const incompleteDigestsBySpec: { path: string; labels: readonly string[] }[] = [];
    // `status: active` specs missing a `## Execution` section (ADR-0116, spec-side invariant).
    const activeSpecsWithoutExecution: string[] = [];

    for (const specPath of specFiles) {
        const specSource = readFileSync(specPath, 'utf8');
        const parsed = parse_spec_record({ source: specSource, path: specPath });
        if (!isOk(parsed)) {
            // A spec that does not parse is itself blocking for the repo verdict.
            specs.push({ path: specPath, level: 'blocking', diagnostics: [] });
            continue;
        }
        const record = parsed.value;
        // C009 resolves a source ref relative to the spec dir OR the workspace root (`intake/x.md` at the
        // workspace root, sourced from `specs/<feature>/spec.md`, must resolve — not only a co-located ref).
        const exists = build_source_exists(specPath, input.workspaceDir);
        // The C015 resolver, built from this spec's named sources.md (admit-all when none resolvable).
        const anchor_resolves = build_anchor_resolver(specSource, specPath);
        const diagnostics = run_spec_checks({ spec: record, exists, anchor_resolves });
        specs.push({ path: specPath, level: verdict_for(diagnostics), diagnostics });

        // C002 is frontmatter-`id:` uniqueness only. Requirement ids (AC-NNN) are SPEC-SCOPED
        // (ADR-0080): unique within a file (enforced by C001), reused freely across specs; a cross-spec
        // reference qualifies as SPEC-x#AC-NNN. So a bare AC-001 in two specs is not a collision.
        if (record.frontmatter.id !== null) {
            frontmatterIdToPaths.set(record.frontmatter.id, [
                ...(frontmatterIdToPaths.get(record.frontmatter.id) ?? []),
                specPath,
            ]);
        }
        if (record.frontmatter.supersededBy !== null || record.frontmatter.status === 'superseded') {
            supersessions.push({
                path: specPath,
                supersededBy: record.frontmatter.supersededBy,
                status: record.frontmatter.status,
            });
        }
        const slugs = finding_candidates(specSource);
        if (slugs.length > 0) {
            candidatesBySpec.push({ path: specPath, slugs });
        }
        const incompleteDigests = incomplete_execution_digests(specSource);
        if (incompleteDigests.length > 0) {
            incompleteDigestsBySpec.push({ path: specPath, labels: incompleteDigests });
        }
        // Shipped-spec invariant, spec side (ADR-0116 Decision 2): a spec whose own frontmatter status is
        // `active` (the in-force living-spec state, ADR-0108) MUST carry a `## Execution` change-cycle
        // entry — the durable AC→evidence digest ADR-0110 keeps for the change that shipped. Reuses the
        // section list ADR-0110's parse already produces (sectionTitles holds every `## <title>`, fenced
        // examples excluded), so `## Execution` detection is the same parse the digest checks key on — no
        // new freeform parsing. 0-FP by construction: gated on the in-force `active` status alone, so a
        // draft/ready/in-flight spec (not yet shipped) and a superseded/legacy spec are never touched.
        if (
            record.frontmatter.status === 'active' &&
            !record.sectionTitles.some((title) => title.trim().toLowerCase() === 'execution')
        ) {
            activeSpecsWithoutExecution.push(specPath);
        }
    }

    const findings: WorkspaceFinding[] =
        input.includeValidity === false ? [] : [...workspace_validity(input.workspaceDir)];
    for (const [id, paths] of frontmatterIdToPaths) {
        if (paths.length > 1) {
            findings.push({
                code: 'C002',
                level: 'blocking',
                message: `frontmatter id ${id} is claimed by ${paths.length} specs`,
            });
        }
    }

    // Supersede resolution (ADR-0106 item 4, ungated by ADR-0108): every `superseded_by` resolves to a
    // real spec id, and a `status: superseded` spec names its replacement. Deterministic set-membership
    // (a strong 0-FP candidate, like the spec-coverage-drift advisory) — but ADVISORY: a `warning`, no
    // C-id, no checks.yaml rule, until measured 0-FP on the real corpus and promoted (ADR-0063).
    for (const { path, supersededBy, status } of supersessions) {
        if (supersededBy !== null && !frontmatterIdToPaths.has(supersededBy)) {
            findings.push({
                code: 'supersede-unresolved',
                level: 'warning',
                message: `${path} declares superseded_by: ${supersededBy} but no spec with that id exists in this workspace`,
            });
        }
        if (status === 'superseded' && supersededBy === null) {
            findings.push({
                code: 'supersede-missing-pointer',
                level: 'warning',
                message: `${path} is status: superseded but names no superseded_by spec (a superseded spec points at its replacement, ADR-0108)`,
            });
        }
    }

    // Duplicate-content (ADR-0106 item 3): findings that restate each other verbatim. Advisory warning,
    // exact-match only (0-FP); fuzzy/near-duplicate detection is deferred to a measured threshold.
    for (const group of find_duplicate_findings(input.workspaceDir)) {
        findings.push({
            code: 'duplicate-content',
            level: 'warning',
            message: `duplicate finding content — ${group.join(', ')} share an identical body; single-source it (ADR-0096)`,
        });
    }

    // Promotion-or-die (ADR-0106 item 6): a finding candidate a spec's `## Execution` named must land in
    // findings/<slug>.md, else the lesson evaporated with the ephemeral run. Deterministic 0-FP — only a
    // NAMED slug is checked. Advisory warning, read-only (never writes the board — ADR-0084 D3 holds).
    for (const { path, slugs } of candidatesBySpec) {
        for (const slug of slugs) {
            if (!existsSync(join(input.workspaceDir, 'findings', `${slug}.md`))) {
                findings.push({
                    code: 'unpromoted-finding',
                    level: 'warning',
                    message: `${path} names finding candidate "${slug}" but findings/${slug}.md does not exist — promote it (corpus promote) or drop the mention`,
                });
            }
        }
    }

    // Incomplete-execution-digest (ADR-0110): a `## Execution` entry that is half-stamped — one staleness
    // pin without the other. Deterministic 0-FP (no digest is allowed; both is complete; only the XOR
    // flags). Advisory warning, reconcile-only — no checks.yaml rule, never blocks (ADR-0063/0077).
    for (const { path, labels } of incompleteDigestsBySpec) {
        for (const label of labels) {
            findings.push({
                code: 'incomplete-execution-digest',
                level: 'warning',
                message: `${path}: Execution entry "${label}" has one staleness pin but not the other — complete it (reviewed-sha + evidence-hash, via corpus stamp) or drop both (ADR-0110)`,
            });
        }
    }

    // Shipped-spec invariant, spec side (ADR-0116 Decision 2; SPEC-method-gates AC-005, the tractable
    // core): an `active` spec with no `## Execution` section is incoherent — the board-recorded "shipped"
    // state and the ADR-0110 AC→evidence digest are owed but absent. Advisory warning, reconcile-only —
    // no C-id, no checks.yaml rule, never blocks (ADR-0063/0077), pending measured 0-FP and promotion.
    // The board/spec status-coherence half of ADR-0116 (Decision 1) stays proposed — the status.md board
    // is freeform prose; parsing it for "shipped" claims is high-FP and out of scope here.
    for (const path of activeSpecsWithoutExecution) {
        findings.push({
            code: 'active-spec-no-execution',
            level: 'warning',
            message: `${path} is status: active but has no ## Execution section — a shipped living spec carries its AC→evidence digest (add a ## Execution change-cycle entry, ADR-0116/0110)`,
        });
    }

    // C017 orphaned-reference (ADR-0097, #45): a bundled `.agents/skills/<name>/references/<file>` the
    // SKILL.md never names. Workspace-scoped like C002; self-guards (empty when no .agents/skills/ dir),
    // so it is safe to run unconditionally. A warning nudge — the reference is dead weight, not broken work.
    for (const orphan of find_orphaned_references(input.workspaceDir)) {
        findings.push({
            code: 'C017',
            level: 'warning',
            message: `skill ${orphan.skill}: bundled reference references/${orphan.reference} is named nowhere in its SKILL.md (orphaned)`,
        });
    }

    // Change plans (AC-006): run C010/C011 over each `change-plans/*.md`. A `SPEC-x#AC-NNN` ref
    // resolves against the same workspace specs/ tree the spec checks read; the resolver is built
    // once over all spec files (a workspace-wide index). Folded into the repo verdict — a blocking
    // C010 makes the verdict blocking.
    const resolveSpecRef = build_spec_ref_resolver(specFiles);
    const changePlans: WorkspaceSpecResult[] = [];
    for (const planPath of find_change_plan_files(input.workspaceDir)) {
        const report = check_change_plan({
            source: readFileSync(planPath, 'utf8'),
            path: planPath,
            spec_ref_resolves: resolveSpecRef,
        });
        changePlans.push(
            isOk(report)
                ? report.value
                : // A change plan that does not parse is itself blocking for the repo verdict.
                  { path: planPath, level: 'blocking', diagnostics: [] }
        );
    }

    const hasBlocking =
        findings.some((finding) => finding.level === 'blocking') ||
        specs.some((spec) => spec.level === 'blocking') ||
        changePlans.some((plan) => plan.level === 'blocking');
    const hasWarning =
        findings.some((finding) => finding.level === 'warning') ||
        specs.some((spec) => spec.level === 'warning') ||
        changePlans.some((plan) => plan.level === 'warning');
    let level: OutcomeLevel = 'clean';
    if (hasBlocking) {
        level = 'blocking';
    } else if (hasWarning) {
        level = 'warning';
    }

    return ok({
        level,
        verdict: hasBlocking ? 'blocking' : 'clean',
        specs,
        changePlans,
        workspaceFindings: findings,
    });
}
