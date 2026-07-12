---
name: architecture-violations
description: Repair suspec-cli dependency-boundary violations and review structural refactors. Apply when dependency-cruiser fails, a module surface changes, or code moves between modules. Preserve the checker's read-only explicit-path boundary and refuse export laundering or validator weakening. Skip for behavior-only changes that leave module dependencies untouched.
---

# Repair Architecture Violations

Use this guide with `AGENTS.md`, `.agents/repo-conventions.md`, and `docs/05-architecture.md`.

## Invariants

- Cross-module calls enter through the destination module's `useCases/index.ts`.
- Code inside a module imports its own files directly, never through its barrel.
- `models`, `services`, and `testing` remain private to their module.
- `src/infra` imports no module code.
- Commands may perform explicit-path I/O; Core checks remain pure over values and injected
  predicates.
- No layer introduces project-root discovery, mutable project state, configuration, or a review
  judgment.

## Procedure

1. Run `pnpm deps:validate` and preserve the exact violation output.
2. Read the dependency-cruiser rule, importing file, imported file, and both modules' barrels.
3. Trace callers and consumers before choosing the owner of the operation.
4. Move behavior only when responsibility belongs elsewhere. Otherwise expose a real use-case
   function from the owning module's barrel.
5. Keep internal types private. Give the consumer a local structural view when it needs only part of
   an output.
6. Run the focused tests, `pnpm typecheck`, and `pnpm deps:validate`.
7. Inspect the diff for behavior drift and unnecessary public exports.

## Invalid Repairs

Do not:

- weaken or bypass dependency-cruiser rules;
- re-export a private helper only to legalize an import;
- create a pass-through file with no owned operation;
- move unrelated code into `infra`, `helpers`, or another ungoverned directory;
- merge unrelated responsibilities into one allowed file;
- add filesystem discovery to a pure check;
- change behavior merely to make the architecture easier to express.

A boundary is real when the destination module owns the operation and can change its internals
without exposing them to the caller.
