---
type: memory-index
id: memory-index
status: active
updated: {{createdAt}}
---

# Memory index

> Tier-1 of the memory model — the compact recall **MAP** an agent reads *first* and *cheaply*: links, not
> explanations. It links into the Tier-2 evidence store (`finding.md`, `patterns/*.md`, ADRs) and
> MUST NOT duplicate their bodies. Markdown-only, no runtime — this file is the contract a future recall tool
> builds against, not a retrieval engine.
>
> **Load-when discipline (normative):** every entry MUST carry a `Load when` condition — the trigger that tells a
> future agent the entry is relevant to its current task. An entry that cannot name *when it matters* MUST be
> removed: it is dead weight against the distillation loss budget and the `AGENTS.md` density cap. A finding's
> `Status` mirrors the finding `status` enum (`candidate | accepted | promoted | rejected | stale | superseded`).
> Term definitions live in the companion `memory/glossary.md`, never here.

## Purpose

The compact map of durable project knowledge. Read before tasks that may depend
on prior discoveries; follow links to topic files only when the Load-when matches.

## Always-relevant project facts

-

## Topic files

| Topic                 | File                       | Load when                                |
| --------------------- | -------------------------- | ---------------------------------------- |
| Architecture patterns | `patterns/architecture.md` | Editing module boundaries or ownership   |
| Testing patterns      | `patterns/testing.md`      | Adding, moving, or interpreting tests    |
| Debugging patterns    | `patterns/debugging.md`    | Investigating repeated failures          |

## Durable findings

| Finding | Status | Load when |
| ------- | ------ | --------- |
|         |        |           |

## Decisions

| ADR | Status | Load when |
| --- | ------ | --------- |
|     |        |           |

## Stale or superseded memory

| Item | Replacement | Action |
| ---- | ----------- | ------ |
|      |             |        |
