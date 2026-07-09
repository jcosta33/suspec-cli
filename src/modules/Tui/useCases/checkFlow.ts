// The interactive `check` flow: pick a scope (the whole store / one store spec), run the check
// engine with a spinner, show the coloured report. Pure orchestration over the injected Prompter +
// the Core engines, so it is testable with a mock Prompter (no terminal).

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import {
    check_spec,
    lint_store_artifacts,
    resolve_store_dir,
    exit_code_for,
    build_source_exists,
    build_anchor_resolver,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { isOk, isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_check_report, format_store_lint } from '../services/render.ts';

export type CheckFlowDeps = Readonly<{ cwd: string }>;

// The cwd's repo root (a plain dir when git is absent) + its store dir, probed — never created.
function resolve_store(cwd: string): { repoRoot: string; storeDir: string | null } {
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot, probe: true });
    return { repoRoot, storeDir: isOk(store) ? store.value.storeDir : null };
}

function list_store_specs(storeDir: string): string[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    return readdirSync(storeDir)
        .filter((name) => /^spec-.+\.md$/.test(name))
        .map((name) => join(storeDir, name))
        .sort();
}

async function check_one(prompter: Prompter, storeDir: string | null): Promise<number> {
    const specs = storeDir !== null ? list_store_specs(storeDir) : [];
    if (specs.length === 0) {
        prompter.warn('No specs in the store.');
        prompter.outro('Nothing to check — `suspec write spec "<intent>"` scaffolds one.');
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
    spin.start('Running the spec checks…');
    // C009 resolves a source ref relative to the spec's own dir (the store root); C015 needs the
    // anchor resolver too, mirroring the direct `suspec check <file>` path.
    const exists = build_source_exists(file, storeDir ?? file);
    const source = readFileSync(file, 'utf8');
    const anchor_resolves = build_anchor_resolver(source, file);
    const result = check_spec({ source, path: file, exists, anchor_resolves });
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

function check_all(prompter: Prompter, repoRoot: string, storeDir: string | null): number {
    if (storeDir === null) {
        prompter.note('no store for this repo yet — nothing to lint', 'Store');
        prompter.outro('✓ clean');
        return 0;
    }
    const spin = prompter.spinner();
    spin.start("Linting the store's artifacts…");
    const result = lint_store_artifacts({ storeDir, repoRoot });
    spin.stop('Linted.');
    /* v8 ignore start -- lint_store_artifacts folds unreadable artifacts into diagnostics; it does not err */
    if (!isOk(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ blocking');
        return 2;
    }
    /* v8 ignore stop */
    prompter.note(format_store_lint(result.value), 'Store');
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
    prompter.intro('suspec check');
    const { repoRoot, storeDir } = resolve_store(deps.cwd);
    const scope = await prompter.select({
        message: 'What would you like to check?',
        options: [
            { value: 'store', label: "The store's artifacts", hint: 'every run, spec, review, evidence record' },
            { value: 'file', label: 'A single store spec' },
        ],
    });
    if (is_cancelled(scope)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    return scope === 'file' ? check_one(prompter, storeDir) : check_all(prompter, repoRoot, storeDir);
}
