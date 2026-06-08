---
type: adr
id: 0001-single-tool-no-monorepo
status: accepted
created: 2026-06-08
updated: 2026-06-08
supersedes:
superseded_by:
---

# ADR-0001: swarm-cli is a single tool in `/src` — no monorepo, no published partials

## Context

`AGENTS.md` ("Project facts") and specs 001/002/004 targeted a pnpm **monorepo**
`packages/{core,cli,tui,adapter-sdk,verifier-exec,testkit}`, with `swarm-core` owning semantics and
`cli`/`tui` as shells. Dogfounding the parser (spec 002) showed this was an **architecture decision baked
into the specs without ever being decided** — and it cost more than it bought:

- It forced a package boundary before there was a home for shared code, so the `Result` algebra had to be
  **duplicated** into `packages/core/src/shared/` (the real one lives in `src/infra/errors/`).
- It needed an unspecced "monorepo bootstrap" (`pnpm-workspace.yaml`, per-package `package.json`, project
  references) and build-config edits, none of which existed.
- The benefits a monorepo earns — **publishing `@swarm/core`/`@swarm/adapter-sdk` as standalone libraries**
  and **physically-enforced package boundaries** — are ones we do **not** want: we ship exactly **one
  artifact, the `swarm` CLI**, never a partial. And the repo *already* enforces DDD module boundaries in
  `/src` via **dependency-cruiser** (`.dependency-cruiser.cjs`).

The `cli`/`tui` split was never real either: the TUI is `run_dashboard`, a `Commands` use-case on the same
dispatch path (spec 001 AC-005/006). It is one tool.

## Decision

**swarm-cli is a single tool, one package, with all code in `/src`.** No monorepo, no `packages/`.

- The "core semantics" (SOL parser/IR, lint, verify, …) live in dedicated **`src/modules/`** modules (the
  parser in `src/modules/Sol/`), governed by the **existing dependency-cruiser boundaries** — added to the
  `core-isolation` rule so the language modules cannot depend on `Commands`/`Terminal` (the same
  "core owns semantics, shell is thin" discipline, enforced by the linter already present, not a package
  wall).
- We **ship only the CLI**. We publish **no partial** — no `@swarm/core`, no adapter SDK as a separate
  package.
- Shared code uses the real `src/infra/*` (e.g. `src/infra/errors/result.ts`); nothing is duplicated for a
  package boundary.

**Revisit trigger:** *only* if we later decide to publish a piece as a standalone library for **external**
consumers (e.g. a third-party adapter SDK). We do not today, so monorepo machinery is YAGNI.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The pnpm monorepo `packages/{core,cli,…}` (the prior spec framing) | Buys publishable partials + hard package boundaries we don't want (we ship one CLI); costs a workspace bootstrap, per-package manifests, and shared-code duplication. dep-cruiser already gives the boundary discipline in `/src`. |
| Keep `packages/core` as just a directory (no real workspace) | The half-state that produced the `Result` duplication and an out-of-tree-typecheck gap — worst of both: monorepo paths without monorepo machinery. |
| One package but a dedicated top-level `core/` dir outside `src/modules/` | Needless second convention; the repo's unit of organization is the `src/modules/<M>/` DDD module, enforced by dep-cruiser. The parser is just another (core) module. |

## Consequences

- **Positive:** simpler — no `pnpm-workspace.yaml`, no per-package `package.json`, no project references, no
  `Result` duplication; the parser migrates `packages/core/` → `src/modules/Sol/` and uses the real infra;
  one already-wired toolchain (vitest coverage of `src/modules/**`, `tsc`, `deps:validate`).
- **Negative:** if we ever publish a library, that piece needs extracting — a deliberate, mechanical
  future step, gated on the revisit trigger above.
- **Neutral:** the command surface, provider-neutrality, and the no-vendored-analyzer rule are unchanged;
  only the *packaging* framing is dropped.

## Status

Accepted (v0.1). The spec refinements (001 + AGENTS.md drop the monorepo; 002/004 repoint to
`src/modules/Sol/`) and the parser migration are this change.

## Affected

- Supersedes the monorepo framing in spec 001 and `AGENTS.md` "Project facts".
- Refines specs 002 (parser) and 004 (lint): home is `src/modules/Sol/`, not `packages/core/`.
- Uses (does not change): the `.dependency-cruiser.cjs` boundary rules — the parser module is added to
  `core-isolation`.
