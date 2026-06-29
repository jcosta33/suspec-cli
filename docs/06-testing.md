# Testing

TypeScript tests use **Vitest** and live under **`__tests__/`** folders. This document defines how we add and structure them.

---

## 1. Philosophy

- **Shallow unit tests only.** Every test exercises one function, one class, or one module in isolation. Every dependency that crosses a module boundary or touches the OS is mocked at the import boundary.
- **No integration tests. No E2E.** Not yet. Adding cross-module or end-to-end tests before the unit layer is populated is premature.
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

- Real subprocess round-trips
- Real filesystem I/O
- Cross-module flows end-to-end
- External API calls

---

## 3. File layout

Tests live in **`__tests__/`** subfolders **inside** the folder that owns the code under test.

**Rule:** For `path/to/SourceFile.ts`, the spec is `path/to/__tests__/SourceFile.spec.ts` (same basename).

**Imports:** From `useCases/__tests__/git.spec.ts`, import the subject with a **sibling-relative** path — e.g. `import { current_branch } from '../git';`.

**Module-wide** shared utilities (dummy factories, module-local mocks) live in **`src/modules/<Module>/__tests__/`** at the **module root** and are imported from deeper specs with relative paths.

**Cross-module** test utilities would live in **`src/helpers/__tests__/`** when added (no such directory exists yet).

**Knip** excludes `**/*.spec.{ts,tsx}` from the project graph (`knip.json`) so specs are not analyzed as orphaned modules.

```text
src/modules/Workspace/
├── __tests__/
│   └── workspaceDummy.ts
├── useCases/
│   ├── __tests__/
│   │   └── git.spec.ts
│   └── git.ts
└── index.ts
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

Subject: `src/modules/Workspace/useCases/git.ts` — runs git, parses its output.

Mock external dependencies with `vi.mock()` or inline stubs. No DI framework is used in this CLI.

```typescript
// src/modules/Workspace/useCases/__tests__/git.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { current_branch } from '../git';

vi.mock('node:child_process', () => ({
    spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';

describe('current_branch', () => {
    it('returns the current branch name', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: 'feature/cli-cleanup\n' } as never);

        const result = current_branch('/repo');

        expect(result).toBe('feature/cli-cleanup');
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

Each module owns factories for its domain objects in `__tests__/`. Factories accept a partial override and return a full, plausible instance.

```typescript
// src/modules/Workspace/__tests__/workspaceDummy.ts
import type { WorkspaceConfig } from '../models/config';

export const WorkspaceDummy = {
    create: (overrides?: Partial<WorkspaceConfig>): WorkspaceConfig => ({
        name: 'test-workspace',
        path: '/tmp/test',
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

| Command              | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `pnpm test`          | Vitest in watch mode — use during development |
| `pnpm test:run`      | Vitest single run — use in CI                 |
| `pnpm test:coverage` | Vitest with **v8** coverage; HTML + `lcov`    |

Vitest config is in `vitest.config.ts`. Global setup is `src/setupTests.ts` if present.

---

## 8. Anti-patterns

Do not:

- **Write integration tests yet.** If a test can only be written by wiring up two modules' real code, delete it and write the unit tests for each module separately.
- **Mock event payloads or error values.** They are cheap plain objects. Construct them for real.
- **Depend on real time.** No `setTimeout` in tests, no real `Date.now()` assertions. Use fake timers (`vi.useFakeTimers()`) or explicit values.
- **Share mutable state between tests.** Every test sets up its own dummies, its own mocks.
- **Snapshot-test dynamic output.** Snapshots are for stable, literal structure. If output varies, assert on the content explicitly.
- **Leak mocks across files.** Module-level `vi.mock(...)` is scoped to its spec file — but be disciplined and don't rely on test-file ordering.
