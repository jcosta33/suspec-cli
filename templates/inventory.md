---
type: inventory
id: INV-{{slug}}
title: {{area}} inventory
status: draft
owner: {{team-or-person}}
sources: [code:{{path}}, tests:{{path}}]
created: {{YYYY-MM-DD}}
---

# Inventory: {{area}}

<!-- Maps what exists. Observes, never judges (that is the audit) and never
     prescribes (that is the change plan). -->

## Scope

{{what this inventory covers / excludes}}

## Current modules

| Module | Responsibility | Notes |
|---|---|---|
| `{{path}}` | {{one line}} | {{quirks, duplication}} |

## Current interfaces

| Interface | Callers | Behavior |
|---|---|---|
| `{{fn/endpoint}}` | {{who calls it}} | {{observed contract}} |

## Observed behavior

| Behavior | Evidence |
|---|---|
| {{behavior to preserve}} | `{{test / file:line / output}}` |

## Known risks

- {{spread logic, duplication, inconsistent vocabulary, coverage holes}}

## Existing tests

- `{{test files covering this area}}`

## Unknowns

- {{who may depend on shapes/values we cannot see from here}}
