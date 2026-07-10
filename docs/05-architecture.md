# TypeScript Module Architecture

This document defines the **TypeScript-side module architecture** for the Suspec CLI.

It explains:

- what a module is
- which architectural concepts exist
- what each concept is responsible for
- which folders are public contracts vs private internals
- what a normal module should look like
- how modules interact

This document is the source of truth for **TypeScript module anatomy and dependency direction**.

---

## 1. What a module is

A **module** is a **DDD bounded context / ownership boundary**.

A module is **not** just a CLI command.
A module is the unit that owns:

- a slice of business truth
- the invariants around that truth
- the public useCases that may mutate that truth
- the internal implementation details needed to support that ownership

### The modules

```text
Core         the check engine + the unixOutcome contract
Sol          the plain two-tier spec parser
Terminal     CLI argument parsing
Commands     the check command + usage (the surface)
```

(_Two-tier_ spec form: a spec is a header tier of frontmatter + prose and a body tier of
requirements; Sol parses that plain Markdown shape.)

---

## 2. Module anatomy

A TypeScript module is composed of a **public contract surface** and **private internals**.

### 2.1 Public contract surface

Each module exposes independently-importable contract surfaces, typically through `useCases/index.ts`.

| Contract folder      | Role                              | Import target                                                                                                                                           |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCases/`          | public write boundary (functions) | Relative path to `src/modules/<M>/useCases/index.ts` from the caller, with explicit `.ts`; `export { fn }` only, **no** `export type` from `useCases/`. |
| `events/` (optional) | domain event payload types        | Relative path to the event surface from the caller, with explicit `.ts`; `export type` / values as needed.                                              |

> `events/` is the convention for a module that needs to publish event payload types; the checker has no event bus, so no module currently populates one.

### 2.2 Private internals

These are implementation details and may change freely inside the module.

```text
models/
repositories/
services/
validators/   (optional)
```

These are private unless explicitly promoted to a contract-folder barrel. `validators/` is the convention for a module that needs them; no module currently has one (invariant checks live inline or in `services/`).

## 3. Architectural Concepts

### 3.1 `useCases/`

Use cases orchestrate workflows. They do NOT contain deep business logic (that goes in `services/` or `validators/`) or direct I/O (that goes in `repositories/`).

### 3.2 `repositories/`

Repositories are the **I/O layer**.
They are thin adapters between business logic and the outside world.

A repository may access:

- File system (`fs`)
- Child processes (`spawn`, `exec`)
- Git commands

### 3.3 `models/`

Models are the plain data structures that represent your domain. They contain no logic. They are strictly private to their module.

### 3.4 `services/`

Services contain stateless business logic that spans multiple entities or concepts but does not belong in one use case. (e.g. specialized path resolution, AST parsing).

### 3.5 `validators/` (optional)

Validators enforce invariants. They are pure functions that check whether an operation is valid. This is a reserved convention — no module currently has a `validators/` folder; invariant checks live inline or in `services/`.

## 4. Dependency direction

Here is the intended dependency direction inside a module.

```text
Commands (CLI boundary)
  -> useCases

useCases
  -> models
  -> validators
  -> services
  -> repositories

repositories
  -> external APIs / fs / git
```

Never the reverse. `repositories` MUST NOT import from `useCases`.

## 5. Cross-module interaction

Modules interact only through each other's root barrel (`useCases/index.ts`) — `dependency-cruiser`
forbids deep imports. The composition flows one way: `Commands` → `Core` → `{ Sol, Terminal }` →
`infra`. There is no event bus or DI container; the engine is composed directly and returns
`Result`s, with filesystem access injected as predicates built by the command from explicit paths
(the engine itself stays pure). The contract util (`Core/unixOutcome`) owns the
stdout/stderr/exit boundary.

---

## 6. Review checklist

Before accepting TypeScript module architecture work, verify:

1. Is the module boundary an ownership boundary?
2. Are models plain and framework-free?
3. Are use cases the real write boundary?
4. Are use-case **types** kept private?
5. Are repositories truly I/O-only?
6. Are validators/services private and well-scoped?
7. Is cross-module interaction happening only via approved patterns?
