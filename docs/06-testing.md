# Testing

TypeScript tests use **Vitest** and live under **`__tests__/`** folders. This document defines how we add and structure them.

---

## 1. Philosophy

- **Default to focused unit tests.** Most tests exercise one function, one class, or one module in isolation. Dependencies that cross a module boundary or touch the OS are mocked when the behavior under test does not require the real boundary.
- **Use focused integration-style tests for boundary truth.** Real git worktrees, temp filesystem state, dispatcher routing, and generated artifact contracts may be exercised directly when mocking them would hide the behavior Suspec relies on. Broad browser/E2E or network-dependent tests are still out of scope.
- **One test file per source file.** The spec lives in **`__tests__/`** inside the same folder as the source file — e.g. `useCases/git.ts` → `useCases/__tests__/git.spec.ts`. Do **not** place `*.spec.ts` beside production files. If a source file is hard to unit-test, that is a signal about the source file, not the tests.
- **Mock surface dependencies, not internals.** When testing a use case, mock the utilities or Node APIs it calls. When testing a pure helper, mock nothing.
- **Real domain types in tests.** Construct real values where possible. Faking them hides bugs.

---

## 2. What we test, what we do not

**Test:**

- Use cases — orchestration logic in `useCases/`
- Services and validators — pure business logic
- Transformers — pure mapping functions
- Presentation helpers — pure utility functions
- CLI command handlers — argument parsing and orchestration

**Do not test (yet):**

- Broad subprocess round-trips that only prove the shell can launch
- Filesystem I/O that is incidental to the behavior under test
- Broad cross-module flows that are better covered by focused unit tests plus a narrow boundary test
- External API calls

---

## 3. File layout

Tests live in **`__tests__/`** subfolders **inside** the folder that owns the code under test.

**Rule:** For `path/to/SourceFile.ts`, the spec is `path/to/__tests__/SourceFile.spec.ts` (same basename). **Exception:** specs for private-folder files (`services/`, `models/`) live in the **module-root** `__tests__/` — e.g. `Core/services/checksContract.ts` → `Core/__tests__/checksContract.spec.ts` (see the tree below and the `testing-file-layout` skill).

**Imports:** From `useCases/__tests__/git.spec.ts`, import the subject with a **sibling-relative** path — e.g. `import { current_branch } from '../git';`.

**Module-wide** shared utilities (dummy factories, module-local mocks) live in **`src/modules/<Module>/__tests__/`** at the **module root** and are imported from deeper specs with relative paths.

**Cross-module** test utilities would live in **`src/helpers/__tests__/`** when added (no such directory exists yet).

**Knip** excludes `**/*.spec.{ts,tsx}` from the project graph (`knip.json`) so specs are not analyzed as orphaned modules.

```text
src/modules/Core/
├── __tests__/
│   └── checksContract.spec.ts     (spec for services/checksContract.ts)
├── services/
│   └── checksContract.ts
├── useCases/
│   ├── __tests__/
│   │   └── checkSpec.spec.ts
│   ├── checkSpec.ts
│   └── index.ts
```

---

## 4. Naming convention

Every `it` block should clearly describe the behavior under test:

- `it('returns the current branch name')`
- `it('does not emit when config is empty')`
- `it('throws ConfigError when path is missing')`

---

## 5. How to test each layer

### 5.1 Use cases

Subject: `src/modules/Core/useCases/checkSpec.ts` — parses a spec source and runs the contract
checks over it, with filesystem access injected as a predicate.

Prefer real inputs over mocks: the engine takes sources and predicates, so a spec passes a
markdown string and a plain function. Where a subject reads the filesystem itself (a predicate
builder), use a `mkdtempSync` temp dir. No DI framework is used in this CLI.

```typescript
// src/modules/Core/useCases/__tests__/checkSpec.spec.ts
import { describe, it, expect } from 'vitest';
import { check_spec } from '../checkSpec.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';

describe('check_spec', () => {
    it('reports a clean verdict for a conformant spec', () => {
        const report = assertOk(check_spec({ source: CONFORMANT, path: 'spec.md', exists: () => true }));

        expect(report.level).toBe('clean');
    });
});
```

### 5.2 Services and validators

Treat exactly like transformers — pure functions, no mocks, input/output assertions. One file per validator, one `describe` per exported function.

### 5.3 Transformers

No mocks. No `beforeEach`. Input in, output out.

```typescript
import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
    it('should convert spaces to hyphens', () => {
        expect(slugify('Fix auth redirect loop')).toBe('fix-auth-redirect-loop');
    });
});
```

### 5.4 CLI command handlers

Mock Node APIs (fs, child_process, etc.) at the module boundary. Assert on orchestration logic and side effects.

---

## 6. Patterns

### 6.1 Dummy factories

Each module owns factories for its domain objects in `__tests__/`. Factories accept a partial override and return a full, plausible instance. (A reserved pattern — no module currently needs one; the check engine's inputs are markdown strings, built inline per spec file.)

```typescript
// the shape, when a module grows one: src/modules/<M>/__tests__/<thing>Dummy.ts
export const ReportDummy = {
    create: (overrides?: Partial<Report>): Report => ({
        path: 'spec.md',
        level: 'clean',
        diagnostics: [],
        ...overrides,
    }),
};
```

Use a deterministic counter for IDs, not `Math.random`. Tests should be reproducible.

### 6.2 Mocking Node APIs

Use `vi.mock()` at the module boundary for Node built-ins:

```typescript
vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
}));
```

Test both success and failure branches.

### 6.3 Cleaning up mocks

Use `beforeEach(() => { vi.resetAllMocks(); })` when mocks are shared across tests in a file, or build fresh spies per test when possible.

---

## 7. Running tests

| Command         | Purpose                                       |
| --------------- | --------------------------------------------- |
| `pnpm test`     | Vitest in watch mode — use during development |
| `pnpm test:run` | Vitest single run — use in CI                 |
| `pnpm coverage` | Vitest with **v8** coverage; HTML + `json`    |

Vitest config is in `vitest.config.ts`. Global setup is `src/setupTests.ts` if present.

---

## 8. Anti-patterns

Do not:

- **Write broad integration tests by default.** If a test wires up multiple modules without proving a boundary contract, split it into unit tests plus a narrow boundary test.
- **Mock event payloads or error values.** They are cheap plain objects. Construct them for real.
- **Depend on real time.** No `setTimeout` in tests, no real `Date.now()` assertions. Use fake timers (`vi.useFakeTimers()`) or explicit values.
- **Share mutable state between tests.** Every test sets up its own dummies, its own mocks.
- **Snapshot-test dynamic output.** Snapshots are for stable, literal structure. If output varies, assert on the content explicitly.
- **Leak mocks across files.** Module-level `vi.mock(...)` is scoped to its spec file — but be disciplined and don't rely on test-file ordering.
