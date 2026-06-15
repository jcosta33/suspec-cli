// CheckEngine, workspace scope (AC-006/AC-007): parse every specs/*/spec.md, run the core checks
// over each, add the cross-file checks (C002 duplicate ids) and workspace-validity findings
// (clause (a): an unfilled {{placeholder}} in a live AGENTS.md/board; clause (b): missing core
// templates), and aggregate to one repo verdict — the CI merge-gate surface. Reuses the same
// parse + rule functions as the single-spec engine, so both forms agree. Reads the filesystem;
// writes nothing.

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';

import { ok, isOk, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { run_spec_checks, verdict_for, type Diagnostic } from '../services/checksContract.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type WorkspaceFinding = Readonly<{
    code: 'C002' | 'placeholder' | 'missing-template';
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
    workspaceFindings: readonly WorkspaceFinding[];
}>;

export type CheckWorkspaceInput = Readonly<{
    workspaceDir: string;
    // `--no-workspace`: lint the specs but skip workspace-validity (the AGENTS.md placeholder + the
    // missing-templates checks), for running against a bare specs/ tree without a full kit workspace.
    includeValidity?: boolean;
}>;

const PLACEHOLDER = /\{\{[^}]+\}\}/;

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
                message: `${liveFile} has unfilled {{placeholder}}s (${where}) — fill them in, then re-run \`swarm check\``,
            });
        }
    }
    if (!existsSync(join(workspaceDir, 'templates'))) {
        findings.push({
            code: 'missing-template',
            message: 'no templates/ directory — the core templates are missing',
        });
    }
    return findings;
}

export function check_workspace(input: CheckWorkspaceInput): Result<WorkspaceCheckReport, AppError> {
    const specFiles = find_spec_files(input.workspaceDir);

    const specs: WorkspaceSpecResult[] = [];
    const frontmatterIdToPaths = new Map<string, string[]>();
    const requirementIdToPaths = new Map<string, string[]>();

    for (const specPath of specFiles) {
        const parsed = parse_spec_record({ source: readFileSync(specPath, 'utf8'), path: specPath });
        if (!isOk(parsed)) {
            // A spec that does not parse is itself blocking for the repo verdict.
            specs.push({ path: specPath, level: 'blocking', diagnostics: [] });
            continue;
        }
        const record = parsed.value;
        const exists = (ref: string) => existsSync(resolve(dirname(specPath), ref));
        const diagnostics = run_spec_checks({ spec: record, exists });
        specs.push({ path: specPath, level: verdict_for(diagnostics), diagnostics });

        if (record.frontmatter.id !== null) {
            frontmatterIdToPaths.set(record.frontmatter.id, [
                ...(frontmatterIdToPaths.get(record.frontmatter.id) ?? []),
                specPath,
            ]);
        }
        // Cross-spec requirement-id uniqueness (C002) exempts ONLY drafts — a draft's stub ids (a fresh
        // scaffold's AC-001) are not committed claims (ADR-0078). Every non-draft spec (ready, done, …)
        // carries finalized ids that must be unique, so exempting all-but-`ready` would miss real
        // collisions among finalized specs.
        if (record.frontmatter.status !== 'draft') {
            for (const requirement of record.requirements) {
                requirementIdToPaths.set(requirement.id, [
                    ...(requirementIdToPaths.get(requirement.id) ?? []),
                    specPath,
                ]);
            }
        }
    }

    const findings: WorkspaceFinding[] =
        input.includeValidity === false ? [] : [...workspace_validity(input.workspaceDir)];
    for (const [id, paths] of frontmatterIdToPaths) {
        if (paths.length > 1) {
            findings.push({ code: 'C002', message: `frontmatter id ${id} is claimed by ${paths.length} specs` });
        }
    }
    for (const [id, paths] of requirementIdToPaths) {
        const distinct = new Set(paths);
        if (distinct.size > 1) {
            findings.push({ code: 'C002', message: `requirement id ${id} is reused across ${distinct.size} specs` });
        }
    }

    const hasBlocking = findings.length > 0 || specs.some((spec) => spec.level === 'blocking');
    const hasWarning = specs.some((spec) => spec.level === 'warning');
    let level: OutcomeLevel = 'clean';
    if (hasBlocking) {
        level = 'blocking';
    } else if (hasWarning) {
        level = 'warning';
    }

    return ok({ level, verdict: hasBlocking ? 'blocking' : 'clean', specs, workspaceFindings: findings });
}
