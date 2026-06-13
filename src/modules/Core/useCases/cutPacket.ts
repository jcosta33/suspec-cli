// PrepareEngine.new — cut a task packet from a named spec (AC-013). The Scope is copied from the
// named requirement ids and NOTHING is invented: a scope id that is not a requirement of the spec
// is an error, and an empty scope yields an empty Scope section. Generates a packet that conforms
// to the checks.yaml task_file schema (frontmatter + the required sections); the rich human
// template lives in the kit for authoring, this is the programmatic scaffold the agent fills in.

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';

import { ok, err, isOk, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type CutPacketInput = Readonly<{
    workspaceDir: string;
    specId: string;
    scope: readonly string[];
    taskId?: string;
}>;

export type CutPacketReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    taskId: string;
    scope: readonly string[];
}>;

type FoundSpec = Readonly<{ path: string; requirementIds: readonly string[] }>;

function find_spec(workspaceDir: string, specId: string): FoundSpec | null {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return null;
    }
    for (const entry of readdirSync(specsDir).sort()) {
        const specPath = join(specsDir, entry, 'spec.md');
        if (!existsSync(specPath)) {
            continue;
        }
        const parsed = parse_spec_record({ source: readFileSync(specPath, 'utf8'), path: specPath });
        if (isOk(parsed) && parsed.value.frontmatter.id === specId) {
            return { path: specPath, requirementIds: parsed.value.requirements.map((r) => r.id) };
        }
    }
    return null;
}

function render_packet(input: { taskId: string; specId: string; specRel: string; scope: readonly string[] }): string {
    const scopeList = input.scope.length > 0 ? input.scope.map((id) => `- ${id}`).join('\n') : '<!-- add the requirement ids this task covers -->';
    const verifyList =
        input.scope.length > 0 ? input.scope.map((id) => `- [ ] {{command}} (${id})`).join('\n') : '- [ ] {{command}}';
    return `---
type: task
id: ${input.taskId}
source:
  - ${input.specId}
scope: [${input.scope.join(', ')}]
status: ready
---

# Task: ${input.taskId}

## Source

- Spec: \`${input.specRel}\` (${input.specId})

## Scope

Implement or preserve:

${scopeList}

## Do not change

- {{areas explicitly out of bounds}}

## Affected areas

- \`{{path}}\`

## Verify

${verifyList}

## Agent instructions

1. Read the source spec first; stay inside this task's scope.
2. Run every Verify item and paste the real output — a claim without output is unverified.
3. Re-read your own diff as a skeptic before finishing, then fill the Run summary.

## Findings

## Run summary
`;
}

function default_task_id(specId: string): string {
    return `TASK-${specId.replace(/^SPEC-/, '').toLowerCase()}`;
}

export function cut_packet(input: CutPacketInput): Result<CutPacketReport, AppError> {
    const spec = find_spec(input.workspaceDir, input.specId);
    if (spec === null) {
        return err(createAppError('SpecNotFound', `no spec with id ${input.specId} in this workspace`, { specId: input.specId }));
    }

    const unknown = input.scope.filter((id) => !spec.requirementIds.includes(id));
    if (unknown.length > 0) {
        return err(
            createAppError('UnknownScope', `scope ids are not requirements of ${input.specId}: ${unknown.join(', ')}`, { unknown })
        );
    }

    const taskId = input.taskId ?? default_task_id(input.specId);
    const taskPath = join(input.workspaceDir, 'tasks', `${taskId}.md`);
    if (existsSync(taskPath)) {
        return err(createAppError('TaskExists', `a task packet already exists: tasks/${taskId}.md`, { taskId }));
    }

    const content = render_packet({
        taskId,
        specId: input.specId,
        specRel: relative(input.workspaceDir, spec.path),
        scope: input.scope,
    });
    mkdirSync(dirname(taskPath), { recursive: true });
    writeFileSync(taskPath, content);

    return ok({ level: 'clean', path: taskPath, taskId, scope: input.scope });
}
