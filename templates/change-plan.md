---
type: change-plan
id: CHANGE-{{slug}}
title: {{title}}
status: draft
kind: {{refactor | rewrite | migration | dependency-upgrade | performance |
       test-infra | mechanical-cleanup | architecture-cleanup | schema-change}}
owner: {{team-or-person}}
sources: [{{INV-* / AUDIT-* / SPEC-* / FINDING-*}}]
preserves: [{{SPEC-*#AC-* / #C-* / #I-*}}]
created: {{YYYY-MM-DD}}
---

# Change Plan: {{title}}

## Intent

{{1–3 sentences: the transformation and its outcome.}}

## Why this change is needed

{{the pressure: duplication, risk, upgrade, debt — cite the inventory/audit}}

## Baseline

- {{what the code does/looks like today, per the inventory}}

## Target state

- {{what it looks like after — including what explicitly stays unchanged}}

## Behavioral preservation guarantees

| ID | Behavior | Verify with |
|---|---|---|
| {{SPEC-x#AC-001}} | {{behavior that must not change}} | `{{test-or-check}}` |

<!-- A change that alters observable behavior others may depend on is not a
     pure refactor — enumerate what you preserve; don't gesture at "no behavior
     change". A guarantee with no spec id gets PG-NNN and usually means a spec
     amendment is owed. -->

## Non-goals

- {{behavior/areas this plan must not touch}}

## Affected surfaces

| Surface | Intended change |
|---|---|
| `{{path}}` | {{one line}} |

## Risk areas

- {{where a reviewer should concentrate}}

## Transformation waves

1. {{each wave leaves the codebase green; name the wave's verify step; use a
    bridge release where external consumers exist}}

## Cutover conditions

- {{what must hold before the change counts as landed}}

## Rollback criteria

- {{observable conditions that trigger rollback}}

## Verification strategy

- [ ] `{{preservation suite / contract check / boundary check}}`

## Review focus

- {{the exception list a reviewer of this plan's tasks should start from}}

## Task split

| Task | Wave | Scope (guarantee/requirement ids) |
|---|---|---|
| TASK-{{slug}}-w1 | 1 | {{ids}} |
