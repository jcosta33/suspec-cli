---
type: finding
id: FINDING-VITEST-BARE-EXCLUDE
status: candidate
from: the 2026-06-12 framework-migration verification run
date: 2026-06-12
related: []
---

# Finding: a bare vitest `exclude` replaces the default excludes

## What we learned

Setting `test.exclude: ['node_modules', 'dist']` in vitest.config.ts **replaces** vitest's
default exclude globs (`**/node_modules/**`, …) with literal top-level paths — so vitest
crawled `**/*.test.ts` inside installed packages and ran 148 dependency tests (tsconfig-paths,
zod) as if they were ours.

## Evidence

`pnpm test:run` at migration: `148 failed | 9957 passed (10105)` with every failing file under
`node_modules` layouts (`src/__tests__/match-path-async.test.ts`, `src/v4/classic/tests/…`);
scoped `pnpm test:run src/modules`: `1977 passed (1977)`. Fixed by glob excludes; full run
green afterwards (output in the migration commit).

## Where it applies

- Any vitest config that customizes `test.exclude` — always use glob forms or extend
  `configDefaults.exclude`.

## Where it does not apply

- `coverage.exclude`, which is independent.

## Future guidance

When a test count jumps inexplicably, check whether the runner is collecting inside
`node_modules` before debugging the tests themselves.
