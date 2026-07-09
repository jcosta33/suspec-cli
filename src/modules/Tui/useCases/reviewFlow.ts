// The interactive `suspec review` flow (ADR-0137): pick a store run, then show the SAME read-only
// artifact lint the direct command uses — per-artifact facts, no verdict. Pure orchestration over
// the injected Prompter + the Core engines, so it is testable with a mock Prompter (no terminal).

import { existsSync, readdirSync } from 'fs';

import { resolve_store_dir, lint_run_artifacts, exit_code_for } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_store_lint } from '../services/render.ts';

export type ReviewFlowDeps = Readonly<{ cwd: string }>;

const RUN_FILE = /^run-(.+)\.md$/;

// The run slugs in the store — what there is to review.
function list_runs(storeDir: string): string[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    return readdirSync(storeDir)
        .map((name) => RUN_FILE.exec(name)?.[1])
        .filter((slug): slug is string => slug !== undefined)
        .sort();
}

export async function run_review_flow(prompter: Prompter, deps: ReviewFlowDeps): Promise<number> {
    prompter.intro('suspec review');

    const root = resolve_repo_root(deps.cwd);
    if (!isOk(root)) {
        prompter.error(root.error.message);
        prompter.outro('✗ not a git repository');
        return 2;
    }

    // Probe-only: review never creates the store it reads.
    const store = resolve_store_dir({ repoRoot: root.value, probe: true });
    if (!isOk(store)) {
        prompter.warn('No store for this repo yet — a run appears after `suspec work`.');
        prompter.outro('Nothing to review.');
        return 1;
    }

    const runs = list_runs(store.value.storeDir);
    if (runs.length === 0) {
        prompter.warn('No runs in the store.');
        prompter.outro('Nothing to review.');
        return 1;
    }

    const runSlug = await prompter.select({
        message: 'Which run?',
        options: runs.map((slug) => ({ value: slug, label: slug })),
    });
    if (is_cancelled(runSlug)) {
        prompter.outro('Cancelled.');
        return 1;
    }

    const spin = prompter.spinner();
    spin.start('Linting the run artifacts…');
    const lint = lint_run_artifacts({ storeDir: store.value.storeDir, repoRoot: root.value, runSlug });
    spin.stop('Linted.');
    /* v8 ignore start -- lint_run_artifacts only errs when the picked run vanished mid-flow */
    if (!isOk(lint)) {
        prompter.error(lint.error.message);
        prompter.outro('✗ error');
        return 2;
    }
    /* v8 ignore stop */

    prompter.note(format_store_lint(lint.value), 'Artifact facts');
    prompter.outro(
        lint.value.level === 'clean'
            ? '✓ clean lint — a human still owns the result'
            : '⚠ facts to route — a human owns the result'
    );
    return exit_code_for(lint.value.level);
}
