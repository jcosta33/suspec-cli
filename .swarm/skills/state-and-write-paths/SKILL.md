---
name: state-and-write-paths
description: "Apply when creating, editing, or reviewing any form of state: application truth, shared runtime state, projections, stores, command execution, events, or async fetching. This is the authoritative skill for state ownership and write-path discipline."
---

# SKILL: state-and-write-paths

## Purpose

This skill exists to prevent state confusion, hidden mutation, and fake architecture in the Swarm CLI.

Most architectural drift starts when code stops distinguishing between:

- truth (e.g. AgentState, Task configuration)
- projection (e.g. parsed task graph)
- runtime state (e.g. active child processes, sandboxes)
- UI state (e.g. terminal spinners, prompt answers)
- async fetch state (e.g. network requests to LLM APIs)

This skill teaches agents to decide:

1. what kind of state something is
2. who owns it
3. who may write it
4. how it should be exposed
5. what write path should exist

The primary question is **not** “which store should I use?”
The primary question is **“what kind of state is this?”**

---

## State categories

Every state value must be classified first.

### 1. Application/Domain truth

This is authoritative truth.

Examples:
- Agent state (`AgentState/index.ts`)
- Task configurations (`TaskManagement`)
- Workspace settings (`swarm.config.json`)
- CLI arguments/flags

Properties:
- serializable
- persistent
- business-owned

### 2. Shared runtime state

This is app-wide runtime visibility that is not persistent truth.

Examples:
- Active LLM adapters
- Running daemon processes
- Active terminal sessions
- Event bus instance

Properties:
- cross-feature visible
- not necessarily persistent
- not authoritative project truth

### 3. Ephemeral UI state

This is temporary terminal interaction state.

Examples:
- CLI prompt selections
- Spinner active state
- Output formatting context
- Log trace IDs

### 4. Engine/OS runtime state

This is runtime-owned and non-serializable.

Examples:
- Child process handles (`ChildProcess`)
- File watchers (`FSWatcher`)
- Lockfiles

## Write model

### Commands/actions are the preferred write boundary

All meaningful business writes should happen through explicit CLI use cases.

A command/action should:
- express intent
- validate inputs
- enforce invariants
- update authoritative state
- emit meaningful events via `swarmBus` when warranted
- call adapters/repositories when needed

## Ownership rules

### Every authoritative slice has one owner

Every slice of domain truth has one owning business area (module).
Only its owning write boundary may mutate it directly.

Other code may:
- read it
- request changes through explicit use cases
- react to meaningful events via `swarmBus`
- derive projections from it

Other code may **not** mutate it directly.

## Anti-patterns

### 1. Unclassified state
Wrong: Add new state without deciding whether it is truth, projection, runtime, or UI state.
Right: Classify first, then place it.

### 2. Projection becomes truth
Wrong: Mutable derived state treated as authoritative.
Right: Truth is owned separately; projections remain derivable.

### 3. Events as ownership substitute
Wrong: Emit events everywhere to avoid declaring owners and actions.
Right: Define ownership clearly first; use events only for meaningful occurrences.

## Review checklist

Before accepting state code, verify:
1. What category of state is this?
2. Who owns it?
3. Who is allowed to write it?
4. Is the write path explicit?
5. Is any runtime object leaking into persistent state?
