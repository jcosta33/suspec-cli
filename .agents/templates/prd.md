---
type: prd
id: {{slug}}
status: draft
created: {{createdAt}}
updated: {{createdAt}}
---

# PRD: {{title}}

<!--
Stance: intent-only. This source doc states WHAT outcome is wanted and WHY,
never the mechanism. It MUST NOT author REQ/CONSTRAINT/INVARIANT/INTERFACE
obligation blocks — those come into existence only when this PRD promotes to a
spec.swarm.md via the author pass. Required when a change initiates new product
behaviour or alters the scope of existing behaviour.
-->

## Problem

The user or business problem, in plain prose. State what is wrong or missing,
not how to fix it.

## Users

- Who is affected and which segment the outcome serves.

## Goals

- Outcomes that define success (intent, not mechanism). Outcome statements,
  never REQ blocks.

## Non-goals

- Explicitly out of scope. The boundary of intent; MUST NOT be empty.

## Success metrics

<!-- Each metric SHOULD be expressible as a future monitor: proof, because a
metric that cannot be observed cannot later bind a VERIFY BY. -->

| Metric | Target | How observed (future monitor: proof) |
| ------ | ------ | ------------------------------------ |
| {{metric}} | {{target}} | {{howObserved}} |

## Release constraints

- Date / rollout / compliance / dependency limits on shipping. Constraints on
  delivery, not authored CONSTRAINT blocks.

## Linked evidence

<!-- Cross-file refs use <spec-id>#<local-id> where an evidence item has a local id. -->

- research: (e.g. password-recovery-survey#F-002)
- finding:
