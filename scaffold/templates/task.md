---
type: task
id: TASK-{{slug}}
source:
  - SPEC-{{slug}}
  # - CHANGE-{{slug}}   (when the work executes a change-plan wave)
scope: [AC-001, AC-002]
status: ready
---

# Task: {{title}}

## Source

- Spec: `specs/{{feature}}/spec.md` (SPEC-{{slug}})
- {{Change plan: `change-plans/{{slug}}.md` (CHANGE-{{slug}}) — if any}}

## Scope

Implement or preserve:

- AC-001 — {{one line}}
- AC-002 — {{one line}}

## Do not change

- {{areas explicitly out of bounds}}

## Affected areas

<!-- Multi-repo workspace: an entry may carry a context prefix matching a
     Commands sub-heading (`web: src/checkout/…`); one context per task. -->

- `{{path}}`

## Verify

- [ ] `{{test-or-command}}` (AC-001)
- [ ] `{{test-or-command}}` (AC-002)

## Agent instructions

1. Read the source spec (and change plan, if any) first.
2. Stay inside this task's scope. If a requirement can't be met as written,
   stop and say why instead of improvising.
3. Run every Verify item and paste the real output — a claim without output
   counts as unverified.
4. Before finishing, re-read your own diff as a skeptic: what would a
   reviewer flag?
5. Fill `## Run summary` below — changed files, one line per Verify command
   citing its pasted output above, out-of-scope edits, blocked questions —
   and drop anything durable in `## Findings`.

## Findings

<!-- Anything durable discovered during the task — moved to findings/ at Close. -->

## Run summary

<!-- Filled by the implementing agent at the end of the run — the handoff
     digest the review packet reads. Cite the Verify pastes above; never
     re-paste output here. -->

- Changed files: {{paths}}
- Verify results: {{one line per command, citing its Verify item above}}
- Out-of-scope edits: {{none, or each listed with a reason}}
- Blocked questions: {{none, or each stated}}
