// The interactive `check` flow (AC-015): pick a scope (whole workspace / one spec), run the check
// engine with a spinner, show the coloured report. Pure orchestration over the injected Prompter +
// the Core engines, so it is testable with a mock Prompter (no terminal).

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';

import { check_spec, check_workspace, exit_code_for } from '../../Core/useCases/index.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_check_report, format_workspace_report } from '../services/render.ts';

export type CheckFlowDeps = Readonly<{ workspaceDir: string }>;

function list_specs(workspaceDir: string): string[] {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return [];
    }
    return readdirSync(specsDir)
        .map((entry) => join(specsDir, entry, 'spec.md'))
        .filter((path) => existsSync(path))
        .sort();
}

async function check_one(prompter: Prompter, workspaceDir: string): Promise<number> {
    const specs = list_specs(workspaceDir);
    if (specs.length === 0) {
        prompter.warn('No specs found under specs/.');
        prompter.outro('Nothing to check.');
        return 1;
    }
    const file = await prompter.select({
        message: 'Which spec?',
        options: specs.map((path) => ({ value: path, label: path })),
    });
    if (is_cancelled(file)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const spin = prompter.spinner();
    spin.start('Running C001–C009…');
    const exists = (ref: string) => existsSync(resolve(dirname(file), ref));
    const result = check_spec({ source: readFileSync(file, 'utf8'), path: file, exists });
    spin.stop('Checked.');
    if (!isOk(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ blocking');
        return 2;
    }
    prompter.note(format_check_report(result.value), 'Result');
    prompter.outro(report_outro(result.value.level));
    return exit_code_for(result.value.level);
}

function check_all(prompter: Prompter, workspaceDir: string): number {
    const spin = prompter.spinner();
    spin.start('Checking every spec in the workspace…');
    const result = check_workspace({ workspaceDir });
    spin.stop('Checked.');
    /* v8 ignore start -- check_workspace folds bad specs into a blocking result; it does not err */
    if (!isOk(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ blocking');
        return 2;
    }
    /* v8 ignore stop */
    prompter.note(format_workspace_report(result.value), 'Workspace');
    prompter.outro(report_outro(result.value.level));
    return exit_code_for(result.value.level);
}

function report_outro(level: 'clean' | 'warning' | 'blocking'): string {
    if (level === 'clean') {
        return '✓ clean';
    }
    return level === 'warning' ? '⚠ warnings — review above' : '✗ blocking — fix the hard errors';
}

export async function run_check_flow(prompter: Prompter, deps: CheckFlowDeps): Promise<number> {
    prompter.intro('swarm check');
    const scope = await prompter.select({
        message: 'What would you like to check?',
        options: [
            { value: 'workspace', label: 'The whole workspace', hint: 'every specs/*/spec.md' },
            { value: 'file', label: 'A single spec' },
        ],
    });
    if (is_cancelled(scope)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    return scope === 'file' ? check_one(prompter, deps.workspaceDir) : check_all(prompter, deps.workspaceDir);
}
