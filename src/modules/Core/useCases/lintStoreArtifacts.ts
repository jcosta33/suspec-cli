// `suspec check` with no args (ADR-0137): lint the STORE's artifacts for this repo — there is no
// workspace tree and no repo verdict anymore. Composition by reuse: every `run-*.md` goes through
// the existing per-run artifact lint (which covers its driving spec, its review packet, and its
// evidence records), and every `spec-*.md` no run reached is linted with the same contract spec
// checks — so a backlog spec is checked before anything works it. Per-artifact facts only; the
// level aggregates per-check severity. Read-only; an empty store is clean.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { ok, isOk, isErr, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { run_spec_checks } from '../services/checksContract.ts';
import { lint_run_artifacts, type StoreLintArtifact } from './lintRunArtifacts.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type LintStoreReport = Readonly<{
    level: OutcomeLevel;
    runCount: number;
    specCount: number;
    artifacts: readonly StoreLintArtifact[];
}>;

export type LintStoreArtifactsInput = Readonly<{ storeDir: string; repoRoot: string }>;

const RUN_FILE = /^run-(.+)\.md$/;
const SPEC_FILE = /^spec-.+\.md$/;

function level_for(artifacts: readonly StoreLintArtifact[]): OutcomeLevel {
    const all = artifacts.flatMap((artifact) => artifact.diagnostics);
    if (all.some((diagnostic) => diagnostic.severity === 'hard-error')) {
        return 'blocking';
    }
    return all.length > 0 ? 'warning' : 'clean';
}

export function lint_store_artifacts(input: LintStoreArtifactsInput): Result<LintStoreReport, AppError> {
    const artifacts: StoreLintArtifact[] = [];
    const seen = new Set<string>();
    let runCount = 0;
    let specCount = 0;

    const names = existsSync(input.storeDir) ? readdirSync(input.storeDir).sort() : [];

    // Every run first: the per-run lint covers the run record, its driving spec, its review packet,
    // and its evidence records in one pass.
    for (const name of names) {
        const match = RUN_FILE.exec(name);
        if (match === null) {
            continue;
        }
        runCount += 1;
        const linted = lint_run_artifacts({ storeDir: input.storeDir, repoRoot: input.repoRoot, runSlug: match[1] });
        /* v8 ignore next 3 -- lint_run_artifacts only errs when the run file vanished between readdir and read */
        if (isErr(linted)) {
            continue;
        }
        for (const artifact of linted.value.artifacts) {
            if (seen.has(artifact.path)) {
                continue; // two runs driving one spec lint it once
            }
            seen.add(artifact.path);
            artifacts.push(artifact);
        }
    }

    // Then every spec no run reached — the backlog gets the same contract checks.
    for (const name of names) {
        if (!SPEC_FILE.test(name)) {
            continue;
        }
        const path = join(input.storeDir, name);
        specCount += 1;
        if (seen.has(path)) {
            continue;
        }
        seen.add(path);
        let source: string;
        try {
            source = readFileSync(path, 'utf8');
            /* v8 ignore next 4 -- a dir masquerading as spec-*.md */
        } catch {
            specCount -= 1;
            continue;
        }
        const parsed = parse_spec_record({ source, path });
        if (!isOk(parsed)) {
            artifacts.push({
                path,
                diagnostics: [{ check: 'C001', severity: 'hard-error', message: parsed.error.message }],
            });
            continue;
        }
        const exists = (ref: string): boolean =>
            existsSync(join(input.storeDir, ref)) || existsSync(join(input.repoRoot, ref));
        artifacts.push({
            path,
            diagnostics: run_spec_checks({ spec: parsed.value, exists }).map((diagnostic) => ({
                check: diagnostic.code,
                severity: diagnostic.severity,
                message: diagnostic.message,
            })),
        });
    }

    return ok({ level: level_for(artifacts), runCount, specCount, artifacts });
}
