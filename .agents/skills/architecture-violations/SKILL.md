---
name: architecture-violations
description: Apply when fixing architecture violations, refactoring modules, restructuring boundaries, or performing codebase audits. Contains mandatory rules for addressing violations properly without hacking around the architecture. Prevents ad-hoc barrel re-exports outside module roots, fake use cases, dumping unrelated logic into single files, and other forms of malicious or fake compliance.
---

# Architecture Violations Skill

This document explains **why** the architecture must be followed, **how** to reason about real compliance, and **which forms of fake or malicious compliance are forbidden**.

It applies to both AI agents and human maintainers.

This is not another architecture overview. It is a guardrail document for preventing architectural drift, shortcut-driven refactors, validator gaming, and code that "passes the rules" without preserving the meaning of the rules.

**Canonical module-boundary reference:** `AGENTS.md` § Architecture discipline and `docs/05-architecture.md`.

---

## 1. When to Apply This Skill

Apply this skill when:

- fixing any architecture violation detected by `pnpm deps:validate`
- restructuring a feature or module
- moving logic across layers
- introducing new public surfaces
- adding use cases, adapters, or stores
- cleaning up tech debt
- performing a codebase audit
- refactoring legacy code toward the target architecture
- reviewing whether a change is _actually_ compliant or only cosmetically compliant

---

## 2. Core Principle

**Fix violations properly — never hack around the rules.**

If a violation exists, the correct fix is to establish the proper architecture so the code flows through the right boundary.

Never:

- change validation rules to make violations pass
- create barrel exports of non-contract entities to bypass restrictions
- move code into a "fake" use case, action, or utility file just to make imports legal
- rename files or folders to trick the validator
- move forbidden logic into `src/helpers/`, `src/shared/`, `utils/`, or other ungoverned escape hatches
- split code into many tiny files without improving responsibilities
- collapse multiple responsibilities into a giant "allowed" file
- keep unauthorized mutation but wrap it behind an allowed import path
- create compatibility wrappers that become permanent shadow architecture

A refactor is compliant only if it improves or preserves the _meaning_ of the boundary, not just the path.

### 2.1 The Three Strikes Rule & Strategic Backtracking

If you attempt to fix an architectural violation or compilation error 3 times and fail, **you must stop**. You are on the wrong architectural path. Do not enter a hallucination loop patching broken abstractions. Discard your current approach, reread the module contracts, and formulate a fundamentally different strategy.

### 2.2 Blast Radius Awareness

When fixing violations, do not suffer from tunnel vision. Trace the upstream callers and downstream dependencies of the files you move. Use the TypeScript compiler (`pnpm typecheck`) to exhaustively navigate the blast radius of your changes.

---

## 3. Why Compliance Matters

Architecture compliance is not cosmetic consistency.

The architecture exists because this CLI has hard constraints that cannot be negotiated away by clever code organization.

### 3.1 Shared state without ownership becomes corruption

The project model is the source of truth. That only works if ownership is real.

If multiple features casually mutate shared state because it is convenient, then:

- undo semantics become unclear
- persistence no longer reflects clear intent
- collaboration becomes harder later
- bugs become distributed instead of local
- refactors cannot be trusted

The architecture exists to preserve one owner per authoritative write surface, while still allowing broad read access via well-defined exports.

### 3.2 CLI coupling destroys reuse and correctness

When business logic lives in CLI command handlers or presentation layers, it becomes:

- harder to test
- harder to reuse
- easier to accidentally duplicate
- dependent on CLI framework quirks
- vulnerable to shortcut code

The architecture exists so business logic can be reasoned about independently of the CLI framework.

### 3.3 Thin shell, thick core is not optional

Shell/framework code (command handlers, prompt wrappers, terminal UI) is a real concern, but it is not the business model.

If shell/framework code becomes the de facto owner of logic, the result is:

- runtime lock-in
- poor testability
- logic duplication across runtimes
- hidden infrastructure assumptions inside business behavior

The architecture exists to keep infrastructure replaceable and business logic stable.

### 3.4 AI agents optimize locally unless constrained

AI agents are very good at making a change "work" locally.
They are much less reliable if the system tolerates shortcut patterns that technically pass linting and dependency rules but violate architectural intent.

This means the codebase needs explicit protection against:

- shortcut abstractions
- fake boundary layers
- pass-through facades
- hidden write surfaces
- giant files that flatten layers
- barrel-export laundering
- compatibility wrappers that become permanent shadow architecture

This skill exists to prevent that.

---

## 4. Semantic Compliance vs Cosmetic Compliance

A change is compliant only if it preserves the meaning of the boundary, not just the path structure.

### 4.1 Real compliance

A change is compliant when it improves or preserves:

- ownership
- write discipline
- runtime isolation
- testability
- truth vs projection separation
- framework independence of business logic

### 4.2 Fake compliance

A change is fake-compliant when it:

- passes dependency-cruiser by routing imports through laundering files
- moves logic into approved folders without changing dependency meaning
- introduces pass-through layers with no real separation
- collapses many concerns into one giant "allowed" file
- preserves hidden bidirectional coupling through indirection
- leaves unauthorized mutation intact while renaming entry points
- keeps runtime ownership in CLI handlers while wrapping it in helper functions

If the architectural meaning did not improve, the refactor did not comply.

### 4.3 The key test

**A boundary is only real if responsibility changes across it.**

If a layer exists only to satisfy the validator while the real logic still lives in the wrong place, it is non-compliant.

### 4.4 Shim annotation-removal is not a refactor

A `TEMPORARY MIGRATION SHIM` (or any similar annotation) is not a comment. It is a task marker: it exists to trigger a real refactor.

Removing the annotation from a file that is still a pure re-export — e.g. `export { getX } from '../services/Y'` — does **not** make the file architecturally sound. The code still launders private access through a fake public surface, and the boundary is still non-existent.

The refactor that discharges a shim annotation is creating a real typed boundary (see §6). Deleting the comment without doing the refactor is malicious compliance, regardless of whether `deps:validate` still passes.

If you cannot complete the refactor in the current session, leave the annotation in place and document the reason in the task file.

---

## 5. Module Boundaries

Each module exposes its public API through a root `useCases/index.ts` barrel. Other modules import only from this root.

```text
src/modules/ModuleName/useCases/index.ts ← public contract
src/modules/ModuleName/useCases/         ← public functions
src/modules/ModuleName/models/           ← private
src/modules/ModuleName/services/         ← private
```

### Importing cross-module

```ts
// CORRECT — import from the module root barrel
import { parse_spec_record } from '../../Sol/useCases/index.ts';

// FORBIDDEN — direct file access from outside the module
import { parse_spec_record } from '../../Sol/useCases/parseSpecRecord.ts';
```

### Importing inside the same module (never own barrel)

Files under `src/modules/<Name>/` must **not** import from their own module root barrel. Use **relative** paths.

```ts
// CORRECT — Sol file importing Sol internals
import { parse_spec_record } from '../useCases/parseSpecRecord.ts';

// FORBIDDEN — same module importing its own barrel
import { parse_spec_record } from '../useCases/index.ts';
```

### Writing a module root barrel

```ts
// src/modules/Core/useCases/index.ts — curated public surface
export { check_spec } from './checkSpec.ts';
export { check_review_file } from './checkReviewFile.ts';

// FORBIDDEN inside useCases/index.ts:
export type { InternalDto } from './checkSpec.ts'; // use-case types do not cross modules
export { read_frontmatter } from '../services/readFrontmatter.ts'; // services/ is private
```

---

## 6. Use cases — behavior crosses modules; types stay local

A use case is the **callable** cross-module contract. Other modules import **functions** from the module root barrel — not types defined in that module's `useCases/`. Each consumer module keeps its own types (or uses `ReturnType<typeof fn>` / `Parameters<typeof fn>`).

### 6.1 What a legitimate use case looks like

Every use case file must export its own typed function:

- The file exports a named function (or arrow) written by the module that owns the use case.
- **Types** used in the signature (`input`, return DTOs, etc.) are **internal** to the module — they are not re-exported from `useCases/index.ts` and are not imported by other modules from another module's use-case barrel.
- The input and output types may use this module's `models/` or inline types in the file.
- The function body may be thin. `return some_service_fn(input)` is acceptable — a use case is allowed to delegate to a private service.
- **Within the same module**, callers use **relative** paths to the file that defines the symbol (`./useCases/<file>`, `../models/…`, etc.). They must **not** import from their own module root barrel.
- **From another module**, callers import **values** from the destination module root barrel only (`export { fn }` on `useCases/index.ts`).

```ts
// Core/useCases/readSpecFrontmatter.ts — legitimate thin use case
import { read_frontmatter as read_frontmatter_map } from '../services/readFrontmatter.ts';

export function read_spec_frontmatter(source: string): Record<string, string | string[]> {
    return read_frontmatter_map(source);
}
```

The service is free to change its internal implementation; the use case absorbs the change. Another module imports `read_spec_frontmatter` and does not import a type alias for its return type from Core's use cases.

### 6.2 What is forbidden

**Importing cross-module directly into a file instead of through the module root:**

```ts
// FORBIDDEN — bypasses the module boundary (direct file access)
import { parse_flags } from '../../Terminal/useCases/cli.ts';

// CORRECT — goes through the module root
import { parse_flags } from '../../Terminal/useCases/index.ts';
```

**Importing use-case types from another module:**

```ts
// FORBIDDEN — types defined in useCases/ are not a cross-module surface
import type { SpecSummary } from '../../Sol/useCases/index.ts';

// Prefer: local shape, or ReturnType<typeof get_spec_summary> after importing the function
```

**Re-exporting a service function through a use-case file:**

```ts
// FORBIDDEN — laundering private access through a fake boundary
export { read_frontmatter } from '../services/readFrontmatter.ts';
export * from '../services/checksContract.ts';
```

This creates no boundary. The consumer imports the service symbol verbatim, under a different path. If the service signature changes, every consumer breaks. There is no translation, no contract, no ownership change across the file.

**Re-exporting non-contract internals from a module root barrel:**

```ts
// FORBIDDEN — index.ts may only re-export from useCases/** or public surfaces
export type { ParseFailure } from '../models/parseFailure.ts'; // models/ is private
export { split_frontmatter } from '../services/frontmatter.ts'; // services/ is private
export type { SpecSummary } from './getSpecSummary.ts'; // use-case types do not cross
```

These patterns are non-compliant even if `deps:validate` passes — a fake public surface does not become a real one just because the path resolves.

If there is nothing to add to a use-case body, define a proper typed function that calls the helper. The function _is_ the boundary.

### 6.3 Internal DTOs when the service shape is not safe to leak

If the service returns a framework-coupled object or internal entity shape, the use case defines **internal** types to map or narrow — those types stay in the module (not on `useCases/index.ts`):

```ts
// Internal to the module — not exported from useCases/index.ts for other modules
type SpecSummary = { id: string; title: string; requirementCount: number };

export function get_spec_summary(input: { source: string }): SpecSummary | null {
    const record = parse_record(input.source); // private service call
    if (!record) return null;
    return { id: record.id, title: record.title, requirementCount: record.requirements.length };
}
```

Other modules import `get_spec_summary` only; they define their own local types or use `ReturnType<typeof get_spec_summary>` if needed.

### 6.4 One function per file

Each use case lives in its own file, named after the function. A file that exports many thin wrappers over a service (e.g. a `frontmatterAccess.ts` re-exporting every `services/frontmatter.ts` symbol) violates both §6.2 (laundering) and the One Function Per File rule. Split it into N files, one per function, each with a real typed signature.

### 6.5 What types a use case file may export

A use case file may declare and export **its own local types** — the function's `Input` / `Output` aliases, an internal DTO it produces, narrowing helpers used only by that function. These are part of the use case's own definition, not borrowed from elsewhere.

What a use case file **must never** export — by re-export or otherwise:

- **Model types or model values** from `../models/...`. Models are private to the owning module.
- **Service or repository types and values** from `../services/` or `../repositories/` — these folders are private internals.

The rule of thumb: if the type is **defined in this file**, exporting it is fine. If the type is **imported from another folder**, re-exporting it from a use case file is laundering — stop and reconsider.

### 6.6 Summary test

Before committing a use-case file, ask:

1. Does this file export its own typed function, not a re-export?
2. If the signature uses internal types, are those types pure models and only referenced **inside this module**?
3. Are we avoiding `export type` of use-case types on `useCases/index.ts` and avoiding cross-module `import type` of those types?

If any answer is no, the boundary is fake or the type surface is too wide.

---

## 7. Summary

Before committing architecture work, verify:

1. Does the change improve or preserve ownership clarity?
2. Are cross-module imports going through module root `useCases/index.ts` only?
3. Are same-module imports using relative paths?
4. Does every use case export its own typed function?
5. Are we avoiding fake boundaries and pass-through re-exports?
6. Did the change reduce or increase shell leakage into the core?
