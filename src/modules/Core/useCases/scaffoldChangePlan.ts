// PrepareEngine.new — scaffold a fresh change plan (R4-ISS-06). The change plan is the riskiest core
// artifact (migrations/rewrites/schema changes) yet was the only one with no `suspec new` generator, so a
// new hire hand-copied templates/change-plan.md. Generates a draft conforming to the change-plan checks
// (C010 preserves-refs-resolve, C011 waves-present): an empty `preserves:` (nothing to resolve) and a
// default `kind: refactor` (waves not required) keep a fresh scaffold check-clean until the author fills
// it. Mirrors the same section shape as the kit's frozen templates/change-plan.md. Never overwrites.

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { is_safe_segment } from '../services/safeSegment.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type ScaffoldChangePlanInput = Readonly<{
    workspaceDir: string;
    slug: string;
    title?: string;
    owner?: string;
}>;

export type ScaffoldChangePlanReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    changePlanId: string;
}>;

function render_change_plan(input: { slug: string; title: string; owner: string }): string {
    const id = `CHANGE-${input.slug}`;
    return `---
type: change-plan
id: ${id}
title: ${input.title}
status: draft
kind: refactor
owner: ${input.owner}
sources: []
preserves: []
---

# Change Plan: ${input.title}

## Intent

{{1–3 sentences: the transformation and its outcome.}}

## Why this change is needed

{{the pressure: duplication, risk, upgrade, debt — cite the inventory/audit}}

## Baseline

- {{what the code does/looks like today}}

## Target state

- {{what it looks like after — including what explicitly stays unchanged}}

## Behavioral preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| PG-001 | {{behavior that must not change}} | \`{{test-or-check}}\` |

<!-- A change that alters observable behavior others may depend on is not a pure refactor — enumerate what
     you preserve; don't gesture at "no behavior change". A guarantee with a spec id reads SPEC-x#AC-001; a
     plan-local one with no spec id gets PG-NNN and usually means a spec amendment is owed. Set \`kind\` to
     migration/rewrite/schema-change when it applies — those require the Transformation waves below. -->

## Non-goals

- {{behavior/areas this plan must not touch}}

## Affected surfaces

| Surface | Intended change |
|---|---|
| \`{{path}}\` | {{one line}} |

## Risk areas

- {{where a reviewer should concentrate}}

## Transformation waves

1. {{each wave leaves the codebase green; name the wave's verify step}}

## Cutover conditions

- {{what must hold before the change counts as landed}}

## Rollback criteria

- {{observable conditions that trigger rollback}}

## Verification strategy

- [ ] \`{{preservation suite / contract check}}\`
`;
}

export function scaffold_change_plan(input: ScaffoldChangePlanInput): Result<ScaffoldChangePlanReport, AppError> {
    if (!is_safe_segment(input.slug)) {
        return err(
            usage_error(
                `invalid change-plan slug: "${input.slug}" — letters, digits, '.', '_', '-' only (no '/' or '..')`
            )
        );
    }
    const planPath = join(input.workspaceDir, 'change-plans', `${input.slug}.md`);
    if (existsSync(planPath)) {
        return err(
            createAppError('ChangePlanExists', `a change plan already exists: change-plans/${input.slug}.md`, {
                slug: input.slug,
            })
        );
    }
    const content = render_change_plan({
        slug: input.slug,
        title: input.title ?? input.slug,
        owner: input.owner ?? '{{team-or-person}}',
    });
    mkdirSync(dirname(planPath), { recursive: true });
    writeFileSync(planPath, content);
    return ok({ level: 'clean', path: planPath, changePlanId: `CHANGE-${input.slug}` });
}
