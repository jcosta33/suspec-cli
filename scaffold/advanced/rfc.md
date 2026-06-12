---
type: rfc
id: RFC-{{slug}}
title: {{title}}
status: proposed
owner: {{team-or-person}}
sources:
  - {{PRD-x / FINDING-x / AUDIT-x that raised the problem}}
---

# RFC: {{title}}

<!-- Lives in specs/<feature>/, beside the spec it argues for.

     Stance: proposal. An RFC advocates ONE approach but commits to nothing
     until the requested decision is made. No requirements are written here —
     they appear in the spec once the decision lands. What outlives the change
     is the comparison: why this approach and not the others. -->

## Problem

{{the technical problem that forces a proposal; cite the PRD, finding, or audit
where one exists}}

## Proposal

{{the advocated approach, in enough detail to evaluate — a mechanism described,
not requirements written}}

## Alternatives

<!-- Do not skip this section — the comparison is the RFC's whole value, and a
     reviewer should reject "none considered" on sight. -->

| Alternative | Why weaker than the proposal |
|---|---|
| {{alternative}} | {{why weaker}} |

## Migration plan

1. {{step / ordering from the present state to the proposed state}}

## Open questions

<!-- An RFC with a blocking open question is not ready for a decision. -->

- {{unresolved point that gates the decision}}

## Decision requested

{{the exact decision being asked for, and where it lands — an accepted ADR in
decisions/ and/or a spec in specs/<feature>/}}
