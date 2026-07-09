// `suspec new task` — cut a task slice from a STORE spec into the STORE (ADR-0137: task packets
// are store artifacts, the agent's typed working memory — never repo files). The splitting rules
// are unchanged: the Scope is copied from the named requirement ids and NOTHING is invented — a
// scope id that is not a requirement of the spec is an error, and an empty scope yields an empty
// Scope section. The slice embeds the scoped requirements (id + Verify command) so it stays
// reviewable even when read apart from the spec. Summon a task when one spec fans out into N
// parallel slices; 1:1 work needs no task (the spec is the unit, ADR-0103).

import { existsSync } from 'fs';
import { join } from 'path';

import { ok, err, isOk, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_spec_record } from '../../Sol/useCases/index.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { task_filename } from '../services/storeLayout.ts';
import { find_store_spec } from './findStoreSpec.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

export type CutTaskInput = Readonly<{
    storeDir: string;
    specRef: string; // a spec id or slug, resolved against the store's spec-*.md files
    scope: readonly string[];
    taskId?: string; // an explicit TASK-<slug> id; default TASK-<spec-slug>
    force?: boolean; // overwrite an existing slice (e.g. re-cut with --scope after an unbounded stub)
}>;

export type CutTaskReport = Readonly<{
    level: OutcomeLevel;
    path: string; // the store task-<slug>.md
    taskId: string;
    specId: string;
    scope: readonly string[];
    // True when the default id collided and the reported taskId carries an auto-suffix (-2, -3, …).
    autoSuffixed: boolean;
}>;

function render_slice(input: {
    taskId: string;
    specId: string;
    specPath: string; // the absolute store path — the slice points at its spec, never copies it
    scope: readonly string[];
    verify: readonly { id: string; command: string | null }[];
}): string {
    const scopeList =
        input.scope.length > 0
            ? input.scope.map((id) => `- ${id}`).join('\n')
            : '<!-- add the requirement ids this task covers -->';
    // Pre-fill each Verify line with the spec's already-parsed `Verify with:` command for that AC,
    // so the slice carries the real command instead of a {{command}} placeholder.
    const verifyList =
        input.verify.length > 0
            ? input.verify.map((v) => `- [ ] ${v.command ?? '{{command}}'} (${v.id})`).join('\n')
            : '- [ ] {{command}}';
    // The embedded spec slice: the scoped requirements (id + Verify command) copied at cut time, so
    // the slice stays checkable on its own.
    const embeddedSlice =
        input.verify.length > 0
            ? input.verify
                  .map((v) => `- ${v.id} — verify: ${v.command !== null ? `\`${v.command}\`` : '(none)'}`)
                  .join('\n')
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

- Spec: \`${input.specPath}\` (${input.specId})

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

<!-- Embedded at cut from ${input.specId}: the scoped requirements, so the slice stays
     checkable on its own. Generated; re-cut to refresh. -->
embedded-spec: ${input.specId}

${embeddedSlice}

## Findings

## Run summary
`;
}

// The slice's store filename stem: the task id minus the TASK- prefix, lower-cased.
function slug_of(taskId: string): string {
    return taskId.replace(/^TASK-/i, '').toLowerCase();
}

export function cut_task(input: CutTaskInput): Result<CutTaskReport, AppError> {
    const spec = find_store_spec(input.storeDir, input.specRef);
    if (spec === null) {
        return err(
            createAppError(
                'store_spec_not_found',
                `no spec ${input.specRef} in the store — \`suspec store list\` shows what is there`,
                {
                    specRef: input.specRef,
                }
            )
        );
    }
    const parsed = parse_spec_record({ source: spec.source, path: spec.path });
    if (!isOk(parsed)) {
        return err(
            createAppError('store_spec_unparseable', `spec ${input.specRef} does not parse: ${parsed.error.message}`, {
                specRef: input.specRef,
            })
        );
    }
    const specId = parsed.value.frontmatter.id ?? input.specRef;
    const requirements = parsed.value.requirements.map((r) => ({ id: r.id, verifyCommand: r.verifyCommand }));

    // Dedup the requested scope so `--scope AC-001,AC-001` doesn't write a duplicated Scope/Verify list.
    const scope = [...new Set(input.scope)];
    const requirementIds = requirements.map((r) => r.id);
    const unknown = scope.filter((id) => !requirementIds.includes(id));
    if (unknown.length > 0) {
        return err(
            createAppError('unknown_scope', `scope ids are not requirements of ${specId}: ${unknown.join(', ')}`, {
                unknown,
            })
        );
    }

    let taskId = input.taskId ?? `TASK-${slug_of(specId.replace(/^SPEC-/, ''))}`;
    // The task id becomes a store filename. Reject any path-escaping id before it is joined into a
    // write path.
    if (!is_safe_segment(taskId)) {
        return err(usage_error(`invalid task id: "${taskId}" — letters, digits, '.', '_', '-' only (no '/' or '..')`));
    }
    // The second slice cut from one spec collides with the first's default id. Only the DEFAULT id
    // auto-suffixes (-2, -3, …) — an explicit --id or --force keeps its exact meaning (collide →
    // error / replace, respectively). The suffix is reported so nothing renames silently.
    let autoSuffixed = false;
    if (input.taskId === undefined && input.force !== true) {
        let candidate = taskId;
        let n = 2;
        while (existsSync(join(input.storeDir, task_filename(slug_of(candidate))))) {
            candidate = `${taskId}-${String(n)}`;
            n += 1;
        }
        if (candidate !== taskId) {
            taskId = candidate;
            autoSuffixed = true;
        }
    }
    const taskPath = join(input.storeDir, task_filename(slug_of(taskId)));
    if (existsSync(taskPath) && input.force !== true) {
        return err(
            createAppError(
                'task_exists',
                `a task slice already exists: ${taskPath} (re-cut with --force to replace it)`,
                { taskId }
            )
        );
    }

    const verify = scope.map((id) => ({
        id,
        command: requirements.find((r) => r.id === id)?.verifyCommand ?? null,
    }));
    const written = write_store_artifact(
        taskPath,
        render_slice({ taskId, specId, specPath: spec.path, scope, verify })
    );
    if (isErr(written)) {
        return err(written.error);
    }

    return ok({ level: 'clean', path: taskPath, taskId, specId, scope, autoSuffixed });
}
