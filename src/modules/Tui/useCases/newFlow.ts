// The interactive `new` flow (AC-013/015): create a task packet from a spec (pick the spec, then
// multiselect its real requirements as scope — never invented) or scaffold a new spec. Pure over
// the injected Prompter + the prepare engine + the spec parser.

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { cut_packet, scaffold_spec } from '../../Core/useCases/index.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { isOk, isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';

export type NewFlowDeps = Readonly<{ workspaceDir: string }>;

function list_specs_with_requirements(workspaceDir: string): { id: string; requirementIds: string[] }[] {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return [];
    }
    const out: { id: string; requirementIds: string[] }[] = [];
    for (const entry of readdirSync(specsDir).sort()) {
        const path = join(specsDir, entry, 'spec.md');
        if (!existsSync(path)) {
            continue;
        }
        const parsed = parse_spec_record({ source: readFileSync(path, 'utf8'), path });
        if (isOk(parsed) && parsed.value.frontmatter.id !== null) {
            out.push({ id: parsed.value.frontmatter.id, requirementIds: parsed.value.requirements.map((r) => r.id) });
        }
    }
    return out;
}

async function new_spec(prompter: Prompter, workspaceDir: string): Promise<number> {
    const slug = await prompter.text({ message: 'Spec slug', placeholder: 'checkout' });
    if (is_cancelled(slug)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const title = await prompter.text({ message: 'Title', defaultValue: slug });
    if (is_cancelled(title)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    const result = scaffold_spec({ workspaceDir, slug, title });
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not scaffold');
        return 2;
    }
    prompter.success(`Scaffolded ${result.value.specId}`);
    prompter.outro(result.value.path);
    return 0;
}

async function new_task(prompter: Prompter, workspaceDir: string): Promise<number> {
    const specs = list_specs_with_requirements(workspaceDir);
    if (specs.length === 0) {
        prompter.warn('No specs to cut a task from.');
        prompter.outro('Create a spec first.');
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

    const result = cut_packet({ workspaceDir, specId, scope });
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not cut the packet');
        return 2;
    }
    prompter.success(`Cut ${result.value.taskId} (${String(scope.length)} scoped)`);
    prompter.outro(result.value.path);
    return 0;
}

export async function run_new_flow(prompter: Prompter, deps: NewFlowDeps): Promise<number> {
    prompter.intro('swarm new');
    const type = await prompter.select({
        message: 'What would you like to create?',
        options: [
            { value: 'task', label: 'A task packet from a spec' },
            { value: 'spec', label: 'A new spec' },
        ],
    });
    if (is_cancelled(type)) {
        prompter.outro('Cancelled.');
        return 1;
    }
    return type === 'task' ? new_task(prompter, deps.workspaceDir) : new_spec(prompter, deps.workspaceDir);
}
