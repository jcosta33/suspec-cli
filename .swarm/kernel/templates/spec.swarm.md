---
type: spec
id: {{slug}}
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: {{title}}
owners: []
imports: []
domain: product
created: {{createdAt}}
updated: {{createdAt}}
---

# Spec: {{title}}

<!--
COPYABLE SKELETON — spec.swarm.md (the source spec).
Fill every {{placeholder}} and replace each "<what goes here>" guide.
Keep the sections below in this exact order — omitting or reordering a required
section is a SOL-S012 document-level defect. Obligation content lives in SOL
blocks (bare header `TYPE PREFIX-NNN:`), never in the surrounding prose (see
the SOL reference).

Frontmatter required set (see the SOL reference): type, id, swarm_language,
aps_version, spec_version, status. Optional: title, owners, imports, domain,
created, updated.
-->

## Intent

<one paragraph: the user-visible or system-visible outcome this spec contracts>

## Non-goals

- <explicitly out of scope, to bound interpretation>

## Context

<only load-bearing background; link research, findings, ADRs, audits — do not paste them>

## Interfaces

<INTERFACE blocks; each MUST bind `VERIFY BY contract:<adapter>:<artifact>` (see the `verify` pass)>

INTERFACE IF-001:
`<fn-or-boundary>` RETURNS `<return-type>`
ACCEPTS:
  - `<input>`
ERRORS:
  - <error>
OWNED BY <owner>
VERIFY BY contract:<adapter>:<artifact>

## Obligations

<REQ blocks: the binding behavioral requirements>

REQ AC-001:
WHEN <trigger>
THE <actor> MUST <observable response>
VERIFY BY test:<adapter>:<artifact>[#selector]
WRITES <surface>
RISK medium

## Constraints

<CONSTRAINT blocks: forbidden actions / restrictions on the solution space>

CONSTRAINT C-001:
THE <actor-or-surface> MUST NOT <forbidden action>
VERIFY BY static:<adapter>:<artifact>

## Invariants

<INVARIANT blocks: properties that MUST hold; prefer property | model | static proofs>

INVARIANT I-001:
<state-or-property> MUST <hold>
VERIFY BY property:<adapter>:<artifact>

## Questions

<QUESTION blocks: captured ambiguity; a [blocking] question MUST be resolved before lowering (see the `lower` pass)>

QUESTION Q-001 [blocking]:
<question>
AFFECTS <id-or-surface>

## Verification coverage

<per-obligation proof binding at a glance: each ID → its `VERIFY BY` reference>

| ID     | VERIFY BY                     |
| ------ | ----------------------------- |
| AC-001 | test:<adapter>:<artifact>     |
| C-001  | static:<adapter>:<artifact>   |
| I-001  | property:<adapter>:<artifact> |
| IF-001 | contract:<adapter>:<artifact> |

## Downstream tasks

<which task frames cover which obligations>

| Task | Covers |
| ---- | ------ |
|      |        |

## Distillation loss statement

### Preserved

- <intent / obligations carried forward without loss>

### Dropped

- <detail intentionally not carried into this spec, and why>

### Still uncertain

- <open uncertainty not yet resolved into a QUESTION>
