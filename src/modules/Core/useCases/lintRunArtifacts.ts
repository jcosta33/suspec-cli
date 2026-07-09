// Artifact lint over one run's STORE artifacts (SPEC-suspec-v2 AC-013) — the existing
// deterministic checks engine re-aimed at store-resident files, surfaced by `done` and `review`.
// Per-artifact diagnostics only; there is NO workspace verdict anywhere on this path. What runs:
//   - the driving spec → the checks-contract spec checks (C001..C019 class) via run_spec_checks;
//   - the review packet (when `review-<run>.md` exists) → C012/C013/C016 keyed on the SPEC's full
//     AC set (the spec is the unit — ADR-0103; the store has no task packets);
//   - the run record → structural facts (a run must name its driving spec);
//   - every evidence record → the provenance honesty check (AC-010): `provenance: cli-verified`
//     without a consistent CLI capture block is FORGED (hard-error), and the enum + ac mapping.
// Read-only. The level aggregates per-check severity (hard-error → blocking, warning → warning).

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isOk, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import {
    check_coverage,
    check_pass_evidence,
    check_verify_binding,
    run_spec_checks,
} from '../services/checksContract.ts';
import { EVIDENCE_PROVENANCES, type EvidenceRecord } from '../services/evidenceArtifact.ts';
import { parse_review_packet } from '../services/parseReviewPacket.ts';
import { fm_scalar, read_frontmatter } from '../services/readFrontmatter.ts';
import { evidence_dir, review_filename, run_filename } from '../services/storeLayout.ts';
import { find_store_spec } from './findStoreSpec.ts';
import { list_evidence_records } from './listEvidenceRecords.ts';
import { verify_evidence_capture } from './verifyEvidenceCapture.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type StoreLintDiagnostic = Readonly<{
    check: string; // a contract C-code, or a store-local code (RUN01, EV01..EV03)
    severity: 'hard-error' | 'warning';
    message: string;
}>;

export type StoreLintArtifact = Readonly<{ path: string; diagnostics: readonly StoreLintDiagnostic[] }>;

export type LintRunArtifactsReport = Readonly<{
    level: OutcomeLevel;
    runSlug: string;
    specId: string | null;
    // The driving spec's parsed requirements — gate-ready (id + named Verify command), so `done`
    // never parses the spec twice. Null when the spec is unresolvable/unparseable (a hard-error
    // diagnostic above says why — there is no gate to run without it).
    requirements: readonly { id: string; verifyCommand: string | null }[] | null;
    artifacts: readonly StoreLintArtifact[];
}>;

export type LintRunArtifactsInput = Readonly<{ storeDir: string; repoRoot: string; runSlug: string }>;

function level_for(artifacts: readonly StoreLintArtifact[]): OutcomeLevel {
    const all = artifacts.flatMap((artifact) => artifact.diagnostics);
    if (all.some((diagnostic) => diagnostic.severity === 'hard-error')) {
        return 'blocking';
    }
    return all.length > 0 ? 'warning' : 'clean';
}

// The evidence-record honesty + shape checks (AC-010/AC-013).
function lint_evidence_record(
    storeDir: string,
    runSlug: string,
    record: EvidenceRecord
): StoreLintDiagnostic[] {
    const diagnostics: StoreLintDiagnostic[] = [];
    if (record.provenance === null || !(EVIDENCE_PROVENANCES as readonly string[]).includes(record.provenance)) {
        diagnostics.push({
            check: 'EV01',
            severity: 'warning',
            message: `provenance is ${record.provenance ?? 'missing'} — expected one of ${EVIDENCE_PROVENANCES.join(' | ')}`,
        });
    }
    if (record.ac === null) {
        diagnostics.push({ check: 'EV02', severity: 'warning', message: 'no `ac:` mapping — the gate cannot use it' });
    }
    if (record.provenance === 'cli-verified' && !verify_evidence_capture(storeDir, runSlug, record)) {
        diagnostics.push({
            check: 'EV03',
            severity: 'hard-error',
            message:
                'claims provenance: cli-verified but its CLI capture block is absent or inconsistent with the stored raw output — only `suspec evidence add` writes cli-verified evidence',
        });
    }
    return diagnostics;
}

export function lint_run_artifacts(input: LintRunArtifactsInput): Result<LintRunArtifactsReport, AppError> {
    const runPath = join(input.storeDir, run_filename(input.runSlug));
    if (!existsSync(runPath)) {
        return err(
            createAppError('store_run_not_found', `no run ${input.runSlug} in the store (searched ${runPath})`, {
                runPath,
            })
        );
    }
    const artifacts: StoreLintArtifact[] = [];

    // --- the run record: structural facts -------------------------------------------------------
    const runSource = readFileSync(runPath, 'utf8');
    const runFrontmatter = read_frontmatter(runSource);
    const specId = fm_scalar(runFrontmatter.spec) ?? null;
    const runDiagnostics: StoreLintDiagnostic[] = [];
    if (fm_scalar(runFrontmatter.type) !== 'run') {
        runDiagnostics.push({ check: 'RUN01', severity: 'warning', message: 'frontmatter `type:` is not `run`' });
    }
    const spec = specId !== null ? find_store_spec(input.storeDir, specId) : null;
    if (spec === null) {
        runDiagnostics.push({
            check: 'RUN02',
            severity: 'hard-error',
            message:
                specId === null
                    ? 'names no driving spec (frontmatter `spec:`) — the gate has nothing to key on'
                    : `driving spec ${specId} resolves to no store spec-*.md`,
        });
    }
    artifacts.push({ path: runPath, diagnostics: runDiagnostics });

    // --- the driving spec: the contract's spec checks, re-aimed at the store --------------------
    let specView: { ids: readonly string[]; commands: ReadonlyMap<string, string | null>; status: string | null } | null =
        null;
    let requirements: { id: string; verifyCommand: string | null }[] | null = null;
    if (spec !== null) {
        const parsed = parse_spec_record({ source: spec.source, path: spec.path });
        if (isOk(parsed)) {
            requirements = parsed.value.requirements.map((requirement) => ({
                id: requirement.id,
                verifyCommand: requirement.verifyCommand,
            }));
            const exists = (ref: string): boolean =>
                existsSync(join(input.storeDir, ref)) || existsSync(join(input.repoRoot, ref));
            artifacts.push({
                path: spec.path,
                diagnostics: run_spec_checks({ spec: parsed.value, exists }).map((diagnostic) => ({
                    check: diagnostic.code,
                    severity: diagnostic.severity,
                    message: diagnostic.message,
                })),
            });
            specView = {
                ids: parsed.value.requirements.map((requirement) => requirement.id),
                commands: new Map(
                    parsed.value.requirements.map((requirement) => [requirement.id, requirement.verifyCommand])
                ),
                status: parsed.value.frontmatter.status,
            };
        } else {
            artifacts.push({
                path: spec.path,
                diagnostics: [{ check: 'C001', severity: 'hard-error', message: parsed.error.message }],
            });
        }
    }

    // --- the review packet (1:1, spec-keyed — the store has no task packets) --------------------
    const reviewPath = join(input.storeDir, review_filename(input.runSlug));
    if (existsSync(reviewPath)) {
        const review = parse_review_packet(readFileSync(reviewPath, 'utf8'));
        const reviewDiagnostics = [
            ...(specView !== null
                ? [
                      ...check_coverage({
                          sourceSpecStatus: specView.status,
                          inScopeIds: specView.ids,
                          specRequirementIds: specView.ids,
                          coverageRowIds: review.coverageRows.map((row) => row.id),
                      }),
                      ...check_verify_binding({
                          sourceSpecStatus: specView.status,
                          namedCommandById: specView.commands,
                          coverageRows: review.coverageRows,
                          verifyBlocks: review.verifyBlocks,
                      }),
                  ]
                : []),
            ...check_pass_evidence(review.coverageRows),
        ];
        artifacts.push({
            path: reviewPath,
            diagnostics: reviewDiagnostics.map((diagnostic) => ({
                check: diagnostic.code,
                severity: diagnostic.severity,
                message: diagnostic.message,
            })),
        });
    }

    // --- every evidence record: the provenance honesty check ------------------------------------
    for (const record of list_evidence_records(input.storeDir, input.runSlug)) {
        const diagnostics = lint_evidence_record(input.storeDir, input.runSlug, record);
        if (diagnostics.length > 0) {
            artifacts.push({ path: join(evidence_dir(input.storeDir, input.runSlug), record.filename), diagnostics });
        }
    }

    return ok({ level: level_for(artifacts), runSlug: input.runSlug, specId, requirements, artifacts });
}
