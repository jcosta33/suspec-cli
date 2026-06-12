---
type: spec
id: SPEC-{{slug}}
title: {{title}}
status: draft
owner: {{team-or-person}}
sources:
  - {{ticket-id-or-intake-file — or "self" when the work originates with you}}
---

# {{title}}

## Intent

{{1–3 sentences: the behavior change and why.}}

## Non-goals

- {{what this spec deliberately does not change}}

## Requirements

<!-- One "### AC-NNN" per requirement, ordered by importance (agents weight
     earlier instructions more). Each requirement gets a "Verify with:" line —
     it is the highest-value line in this file; prefer a runnable test or
     command. Prefer stricter notation? Any spec can use SOL blocks instead:
     add "format: sol" to the frontmatter. See `advanced/sol-reference.md` in your workspace
     (full reference: the Swarm repo's docs/reference/structured-requirements.md). -->

### AC-001 — {{short name}}

When {{condition}}, {{the component}} must {{observable behavior}}.

Verify with: `{{test-name-or-command}}`

## Open questions

- {{anything unresolved — an open question keeps the spec out of `status: ready` unless you mark it "(non-blocking)"}}

## Affected areas

- `{{path}}`

## Dropped from sources

<!-- Optional but recommended: what the ticket/PRD asked for that this spec
     deliberately leaves out, and why. Design rationale lives here. -->

- {{dropped item — reason}}
