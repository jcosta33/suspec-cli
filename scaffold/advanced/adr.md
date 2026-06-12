---
type: adr
id: ADR-{{NNNN}}
title: {{title}}
status: proposed
owner: {{team-or-person}}
sources:
  - {{RFC-x / RESEARCH-x / FINDING-x that forced the decision}}
---

# ADR-{{NNNN}}: {{title}}

<!-- Lives in decisions/ — project-wide, sequentially numbered (0001-, 0002-, …),
     one decision per file.

     Immutable once accepted: a wrong decision is superseded by a new ADR that
     names this one, never edited in place. The ledger of past decisions — and
     why each was made — is the point. -->

## Context

{{what forced the decision — the problem, constraints, or pressure that made a
choice necessary}}

## Decision

{{what was chosen, stated plainly}}

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| {{alternative}} | {{reason}} |

## Consequences

- Positive: {{a tradeoff this decision wins}}
- Negative: {{a cost this decision incurs}}
- Neutral: {{a consequence that is neither clearly good nor bad}}

## Status

{{proposed | accepted | superseded by ADR-NNNN | rejected}}

## Affected requirements

<!-- Optional: spec requirements this decision adds, changes, or retires. -->

- {{SPEC-x}}#{{AC-NNN}} — {{added / changed / retired}}
