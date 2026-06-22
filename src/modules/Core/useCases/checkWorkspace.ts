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
import { check_change_plan } from './checkChangePlan.ts';
import { build_spec_ref_resolver } from './resolveSpecRef.ts';
import { build_anchor_resolver } from './buildAnchorResolver.ts';
import { build_source_exists } from './resolveSourcePath.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type WorkspaceFinding = Readonly<{
    code: 'C002' | 'placeholder' | 'missing-template' | 'agents-oversize';
    // SW-006: an unfilled {{placeholder}} in a freshly-scaffolded AGENTS.md is a "finish setup" nudge,
    // not broken work — it must NOT block the gate on day one (the kit's own AGENTS.md ships with
    // placeholders, so `swarm check` right after `swarm init` would otherwise greet a new user with a
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
