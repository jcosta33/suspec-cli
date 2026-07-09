// The interactive `new` flow (ADR-0137): cut a task slice from a STORE spec (pick the spec, then
// multiselect its real requirements as scope — never invented) or scaffold a new STORE spec from a
// one-line intent (the same scaffold as `suspec write spec`). Pure over the injected Prompter +
// the store engines + the spec parser.

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { cut_task, scaffold_store_spec, resolve_store_dir } from '../../Core/useCases/index.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { resolve_repo_root, head_sha } from '../../Workspace/useCases/index.ts';
import { isOk, isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';

export type NewFlowDeps = Readonly<{ cwd: string }>;

const SPEC_FILE = /^spec-(.+)\.md$/;

function list_specs_with_requirements(storeDir: string): { id: string; requirementIds: string[] }[] {
    if (!existsSync(storeDir)) {
        return [];
    }
    const out: { id: string; requirementIds: string[] }[] = [];
    for (const name of readdirSync(storeDir).sort()) {
        const match = SPEC_FILE.exec(name);
        if (match === null) {
            continue;
        }
        const path = join(storeDir, name);
        const parsed = parse_spec_record({ source: readFileSync(path, 'utf8'), path });
        if (isOk(parsed)) {
            out.push({
                id: parsed.value.frontmatter.id ?? match[1],
                requirementIds: parsed.value.requirements.map((r) => r.id),
            });
        }
    }
    return out;
}

// The spec slug from the intent — the same derivation `suspec write spec` uses.
function intent_slug(intent: string): string {
    return intent
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48)
        .replace(/-+$/, '');
}

async function new_spec(prompter: Prompter, repoRoot: string, storeDir: string): Promise<number> {
    const intent = await prompter.text({ message: 'One-line intent', placeholder: 'checkout applies the discount' });
    if (is_cancelled(intent)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const slug = intent_slug(intent);
    if (slug.length === 0) {
        prompter.error(`cannot derive a spec slug from "${intent}" — use letters or digits`);
        prompter.outro('✗ could not scaffold');
        return 2;
    }
    const result = scaffold_store_spec({ storeDir, slug, intent: intent.trim(), baseSha: head_sha(repoRoot) });
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not scaffold');
        return 2;
    }
    prompter.success(
        result.value.created ? `Scaffolded ${result.value.specId} (draft)` : `Reusing ${result.value.specId}`
    );
    prompter.outro(`${result.value.path}\nnext: author the ACs, then suspec work ${result.value.specId}`);
    return 0;
}

async function new_task(prompter: Prompter, storeDir: string): Promise<number> {
    const specs = list_specs_with_requirements(storeDir);
    if (specs.length === 0) {
        prompter.warn('No specs in the store to cut a task from.');
        prompter.outro('Scaffold a spec first (`suspec write spec "<intent>"`).');
        return 1;
    }
    const specId = await prompter.select({
        message: 'From which spec?',
        options: specs.map((s) => ({ value: s.id, label: s.id })),
    });
    if (is_cancelled(specId)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const chosen = specs.find((s) => s.id === specId);
    /* v8 ignore next 4 -- specId came from the specs list, so chosen is always defined; guards the type system */
    if (chosen === undefined) {
        prompter.outro('Cancelled.');
        return 1;
    }

    let scope: string[] = [];
    if (chosen.requirementIds.length > 0) {
        const picked = await prompter.multiselect({
            message: 'Scope — which requirements does this task cover?',
            options: chosen.requirementIds.map((id) => ({ value: id, label: id })),
        });
        if (is_cancelled(picked)) {
            prompter.outro('Cancelled.');
            return 1;
        }
        scope = picked;
    }

    const result = cut_task({ storeDir, specRef: specId, scope });
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not cut the task');
        return 2;
    }
    prompter.success(`Cut ${result.value.taskId} (${String(scope.length)} scoped)`);
    if (scope.length === 0) {
        // Parity with the direct command: an empty scope cuts an UNBOUNDED task — say so loudly,
        // not as a skimmable "(0 scoped)".
        prompter.warn(
            "no scope selected — this task's scope is EMPTY (unbounded). Fill the Scope section with requirement ids before working."
        );
    }
    prompter.outro(result.value.path);
    return 0;
}

export async function run_new_flow(prompter: Prompter, deps: NewFlowDeps): Promise<number> {
    prompter.intro('suspec new');
    const rootResult = resolve_repo_root(deps.cwd);
    const repoRoot = isErr(rootResult) ? deps.cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        prompter.error(store.error.message);
        prompter.outro('✗ no store');
        return 2;
    }
    const type = await prompter.select({
        message: 'What would you like to create?',
        options: [
            { value: 'task', label: 'A task slice from a store spec' },
            { value: 'spec', label: 'A new store spec (from a one-line intent)' },
        ],
    });
    if (is_cancelled(type)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    return type === 'task'
        ? new_task(prompter, store.value.storeDir)
        : new_spec(prompter, repoRoot, store.value.storeDir);
}
