---
type: rfc
id: {{slug}}
status: proposed
created: {{createdAt}}
updated: {{createdAt}}
---

# RFC: {{title}}

<!--
Stance: proposal / pre-decision. An RFC advocates ONE technical approach but
commits to none until the requested decision is made. It authors NO obligation
blocks (no REQ / CONSTRAINT / INVARIANT / INTERFACE); obligations come into
existence only when this proposal promotes forward via the author pass to an
accepted adr.md and/or an approved spec.swarm.md.
-->

## Problem

<the technical problem that forces a proposal; cite the originating prd.md,
finding.md, or audit.md where one exists>

## Proposal

<the advocated approach, in enough detail to evaluate; describes a mechanism,
authors no obligation blocks>

## Alternatives

<!-- Mandatory: an RFC's value is the comparison it records. "none considered"
is a defect. -->

| Alternative | Why weaker than the proposal |
| ----------- | ---------------------------- |
| {{alternative}} | {{why-weaker}} |

## Migration plan

<!-- Steps and ordering from the present state to the proposed state; NOT
authored TRACE blocks. -->

1. {{step / ordering from the present state to the proposed state}}

## Open questions

<!-- Each unresolved point is a QUESTION (Q-NNN) candidate until resolved (see
the SOL reference); an RFC with a blocking open question
MUST NOT be promoted. -->

- {{unresolved point that gates the decision}}

## Decision requested

<the exact decision being asked for, and its promotion target — an accepted
adr.md and/or an approved spec.swarm.md>
