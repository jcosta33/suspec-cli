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
import { is_safe_segment } from '../services/safeSegment.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type CutPacketInput = Readonly<{
    workspaceDir: string;
    specId: string;
    scope: readonly string[];
    taskId?: string;
    // Overwrite an existing packet (R5-I08) — a common case is re-cutting with `--scope` after a first
    // `suspec new task` (no scope) wrote an unbounded stub that no-clobber then refused to replace.
    force?: boolean;
}>;

export type CutPacketReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    taskId: string;
    scope: readonly string[];
}>;

type SpecRequirement = Readonly<{ id: string; verifyCommand: string | null }>;
type FoundSpec = Readonly<{ path: string; requirements: readonly SpecRequirement[] }>;

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
            return {
                path: specPath,
                requirements: parsed.value.requirements.map((r) => ({ id: r.id, verifyCommand: r.verifyCommand })),
            };
        }
    }
    return null;
}

function render_packet(input: {
    taskId: string;
    specId: string;
    specRel: string;
    scope: readonly string[];
    verify: readonly { id: string; command: string | null }[];
}): string {
    const scopeList =
        input.scope.length > 0
            ? input.scope.map((id) => `- ${id}`).join('\n')
            : '<!-- add the requirement ids this task covers -->';
    // SW-003: pre-fill each Verify line with the spec's already-parsed `Verify with:` command for that
    // AC, so the cut packet carries the real command instead of a {{command}} placeholder the worker
    // has to re-copy. Fall back to the placeholder only where the spec named no command.
    const verifyList =
        input.verify.length > 0
            ? input.verify.map((v) => `- [ ] ${v.command ?? '{{command}}'} (${v.id})`).join('\n')
            : '- [ ] {{command}}';
    // The embedded spec slice (ADR-0100, suspec-cli#2): the scoped requirements (id + Verify command)
    // copied at cut time, so `suspec check`/`review` can validate a task/review even when the live spec
    // lives in a SEPARATE repo (the dedicated-workspace / spec-external layout) and is unresolvable from
    // the workspace. Generated; re-cut to refresh.
    const embeddedSlice =
        input.verify.length > 0
            ? input.verify.map((v) => `- ${v.id} — verify: ${v.command !== null ? `\`${v.command}\`` : '(none)'}`).join('\n')
            : '<!-- empty scope: no embedded slice -->';
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

## Spec snapshot

<!-- Embedded at cut from ${input.specId} (ADR-0100): the scoped requirements, so a review can be
     validated even when the live spec is in a separate repo. Generated; re-cut to refresh. -->
embedded-spec: ${input.specId}

${embeddedSlice}

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
        return err(
            createAppError('SpecNotFound', `no spec with id ${input.specId} in this workspace`, {
                specId: input.specId,
            })
        );
    }

    // Dedup the requested scope so `--scope AC-001,AC-001` doesn't write a duplicated Scope/Verify list.
    const scope = [...new Set(input.scope)];
    const requirementIds = spec.requirements.map((r) => r.id);
    const unknown = scope.filter((id) => !requirementIds.includes(id));
    if (unknown.length > 0) {
        return err(
            createAppError('UnknownScope', `scope ids are not requirements of ${input.specId}: ${unknown.join(', ')}`, {
                unknown,
            })
        );
    }

    const taskId = input.taskId ?? default_task_id(input.specId);
    // The task id becomes a filename (and derives from the spec's on-disk frontmatter id). Reject any
    // path-escaping id before it is joined into a write path (a malicious/cloned workspace otherwise
    // makes `new task` an arbitrary-location writer).
    if (!is_safe_segment(taskId)) {
        return err(usage_error(`invalid task id: "${taskId}" — letters, digits, '.', '_', '-' only (no '/' or '..')`));
    }
    const taskPath = join(input.workspaceDir, 'tasks', `${taskId}.md`);
    if (existsSync(taskPath) && input.force !== true) {
        return err(
            createAppError(
                'TaskExists',
                `a task packet already exists: tasks/${taskId}.md (re-cut with --force to replace it)`,
                {
                    taskId,
                }
            )
        );
    }

    const verify = scope.map((id) => ({
        id,
        command: spec.requirements.find((r) => r.id === id)?.verifyCommand ?? null,
    }));
    const content = render_packet({
        taskId,
        specId: input.specId,
        specRel: relative(input.workspaceDir, spec.path),
        scope,
        verify,
    });
    mkdirSync(dirname(taskPath), { recursive: true });
    writeFileSync(taskPath, content);

    return ok({ level: 'clean', path: taskPath, taskId, scope });
}
