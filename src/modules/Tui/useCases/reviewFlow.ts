// The interactive `swarm review` flow (M2, AC-027): pick a finished run's task, resolve it, run the
// SAME read-only reconcile engine the direct command uses (resolve_review_run → reconcile_review),
// and show the coloured reconcile-facts report. Pure orchestration over the injected Prompter + the
// Core engines, so it is testable with a mock Prompter (no terminal). It surfaces facts and routes —
// it never issues a review result (ADR-0077 Decision 8 / AC-023).

import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

import { resolve_review_run, reconcile_review, exit_code_for } from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_review_report } from '../services/render.ts';

export type ReviewFlowDeps = Readonly<{ workspaceDir: string }>;

// The task ids a run could exist for: the basenames of tasks/*.md.
function list_tasks(workspaceDir: string): string[] {
    const tasksDir = join(workspaceDir, 'tasks');
    if (!existsSync(tasksDir)) {
        return [];
    }
    return readdirSync(tasksDir)
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => name.replace(/\.md$/, ''))
        .sort();
}

export async function run_review_flow(prompter: Prompter, deps: ReviewFlowDeps): Promise<number> {
    prompter.intro('swarm review');

    const root = resolve_repo_root(deps.workspaceDir);
    if (!isOk(root)) {
        prompter.error(root.error.message);
        prompter.outro('✗ not a git repository');
        return 2;
    }

    const tasks = list_tasks(deps.workspaceDir);
    if (tasks.length === 0) {
        prompter.warn('No task packets found under tasks/.');
        prompter.outro('Nothing to review.');
        return 1;
    }

    const task = await prompter.select({
        message: 'Which finished run?',
        options: tasks.map((id) => ({ value: id, label: id })),
    });
    if (is_cancelled(task)) {
        prompter.outro('Cancelled.');
        return 1;
    }

    const spin = prompter.spinner();
    spin.start('Reconciling the run…');
    const resolved = resolve_review_run({ workspaceDir: deps.workspaceDir, repoRoot: root.value, task });
    if (!isOk(resolved)) {
        spin.stop('Could not resolve the run.');
        prompter.error(resolved.error.message);
        prompter.outro('✗ unresolved');
        return 2;
    }
    const report = reconcile_review(resolved.value);
    spin.stop('Reconciled.');
    /* v8 ignore start -- reconcile_review only errs on an unparseable spec; the resolver read it already */
    if (!isOk(report)) {
        prompter.error(report.error.message);
        prompter.outro('✗ error');
        return 2;
    }
    /* v8 ignore stop */

    prompter.note(format_review_report(report.value), 'Reconcile facts');
    prompter.outro(
        report.value.level === 'clean'
            ? '✓ clean reconcile — a human still owns the result'
            : '⚠ facts to route — a human owns the result'
    );
    return exit_code_for(report.value.level);
}
