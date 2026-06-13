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
        if (existsSync(path) && PLACEHOLDER.test(readFileSync(path, 'utf8'))) {
            findings.push({ code: 'placeholder', message: `${liveFile} contains an unfilled {{placeholder}}` });
        }
    }
    if (!existsSync(join(workspaceDir, 'templates'))) {
        findings.push({ code: 'missing-template', message: 'no templates/ directory — the core templates are missing' });
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
            frontmatterIdToPaths.set(record.frontmatter.id, [...(frontmatterIdToPaths.get(record.frontmatter.id) ?? []), specPath]);
        }
        for (const requirement of record.requirements) {
            requirementIdToPaths.set(requirement.id, [...(requirementIdToPaths.get(requirement.id) ?? []), specPath]);
        }
    }

    const findings: WorkspaceFinding[] = [...workspace_validity(input.workspaceDir)];
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
    const level: OutcomeLevel = hasBlocking ? 'blocking' : hasWarning ? 'warning' : 'clean';

    return ok({ level, verdict: hasBlocking ? 'blocking' : 'clean', specs, workspaceFindings: findings });
}
