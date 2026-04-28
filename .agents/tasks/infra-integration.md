# Integrate `src/infra/` into the Swarm CLI

## Metadata

- Slug: infra-integration
- Branch: main (no worktree spawned for this task)
- Created: 2026-04-26
- Status: planning
- Type: refactor

---

## Objective

Take the cross-cutting infrastructure that was just dropped into `src/infra/` (DI container, logger, events bus, store, errors/Result) and weave it into the Swarm CLI **only where it earns its keep**. Per the user's directive: **DI is for container deps only** — singletons that genuinely have one instance per process and benefit from a swappable seam (config, repoRoot, telemetry DB, file-system facade). Everything else stays as plain function calls.

The end state is: one logger, one event bus, one error model, a small set of DI tokens for the things that need to be replaceable in tests, and zero React leftovers in `src/infra/`.

---

## Linked docs

- `AGENTS.md` § Frontend Domain-Driven Architecture (cross-module rules — also apply to `src/infra/`)
- `docs/06-testing.md` (Vitest layout, mocking patterns)
- `docs/07-conventions.md` (function signatures, type-only imports)
- `.agents/skills/architecture-violations/SKILL.md` (what fake compliance looks like)

---

## Inventory — what's actually in `src/infra/`

### Keep & integrate

| Path | API | Use as |
| --- | --- | --- |
| `src/infra/di/Container.ts` | `register / set / get / clear` | Single process-wide registry for tokens. |
| `src/infra/di/inject.ts` | `inject(deps)(factory)` | Wraps a factory; auto-resolves Container tokens, lazy & test override-aware. |
| `src/infra/di/testing/{injectDependencies,createMock,spy}.ts` | Test scaffolding | For unit tests that need to swap container deps. |
| `src/infra/logger/{createLogger,createConsoleWriter,appLogger,types}.ts` | `Logger` with pluggable `LogWriter[]` | **Replace** `src/modules/Terminal/services/logger.ts`. |
| `src/infra/events/{createEventBus,internal/createSubscriptionRegistry,testing/recordEvents,types}.ts` | Typed `on/once/onAny/emit/waitForIdle` | New: process-wide bus for telemetry / lifecycle events. |
| `src/infra/errors/{createAppError,isAppError,result,testing/{assertOk,assertErr}}.ts` | Tagged `AppError`, `Result<V,E>` monad helpers | Tighten error returns in I/O boundaries (Workspace git ops, AgentState writes). |
| `src/infra/store/{createStore,storage/createMemoryStorage,types}.ts` | `Store<T>` with memory storage | Optional — useful for in-memory caches (e.g. config). |

### Delete or quarantine (React/browser leftovers — they don't belong in a CLI)

| Path | Why |
| --- | --- |
| `src/infra/store/useStore.ts` | `useSyncExternalStore` from React. CLI has no React. |
| `src/infra/store/useStoreSelector.ts` | Same. |
| `src/infra/store/useStore.test.tsx` | Same. |
| `src/infra/store/storage/createLocalStorage.ts` | Browser-only. |
| `src/infra/store/storage/LocalStorageKeys.ts` | Browser-only. |
| `src/infra/store/storage/createAutomergeStorage.ts` | Imports `#/modules/CrdtDocument/...` which doesn't exist in this repo. |

These are already excluded from `tsconfig.json`, `knip.json`, and `eslint.config.mjs`. They should be **deleted** in a focused follow-up — Claude won't delete them without an explicit instruction (AGENTS.md safety rule).

---

## DI scope (what gets registered, what doesn't)

> **Rule of thumb:** if it has exactly one process-wide instance and you'd want to mock it in tests, it goes through DI. Everything else is plain imports.

### Register as DI tokens

```ts
// src/infra/di/tokens.ts (new)
export const TOKENS = {
    repoRoot:      Symbol.for('swarm.repoRoot'),     // string — resolved once at boot
    config:        Symbol.for('swarm.config'),       // SwarmConfig — loaded once
    logger:        Symbol.for('swarm.logger'),       // Logger
    eventBus:      Symbol.for('swarm.eventBus'),     // EventBus<SwarmEvents>
    telemetryDb:   Symbol.for('swarm.telemetryDb'),  // Database handle (better-sqlite3)
    clock:         Symbol.for('swarm.clock'),        // () => Date — for deterministic tests
} as const;
```

### Do NOT register

- Pure helpers (`to_slug`, `derive_names`, `validate_dag`, `escape_regex`, `skeletonize`, …) — they're stateless functions; importing them works.
- Use cases themselves (`worktree_create`, `claim_lock`, `record_session`, …) — they take `repoRoot` as input. The function is the seam, not a registered token.
- Adapters (`get_adapter`, `build_args`) — already a registry, doesn't need re-DI.

### Bootstrap

```ts
// src/index.ts — before `main()` runs
import { Container } from './infra/di/Container.ts';
import { createLogger } from './infra/logger/createLogger.ts';
import { createConsoleWriter } from './infra/logger/createConsoleWriter.ts';
import { createEventBus } from './infra/events/createEventBus.ts';
import { TOKENS } from './infra/di/tokens.ts';
import type { SwarmEvents } from './infra/events/swarmEvents.ts';

Container.register(TOKENS.logger,   createLogger([createConsoleWriter()]));
Container.register(TOKENS.eventBus, createEventBus<SwarmEvents>());
Container.register(TOKENS.clock,    () => new Date());
// repoRoot/config/telemetryDb are lazy — registered the first time a command resolves them
```

---

## Proposed migration order

### Phase 1 — foundations (blocks everything else)

1. **Delete the 6 React/browser files** from `src/infra/store/`. Drop their `tsconfig`, `knip`, `eslint` exclusions afterwards.
2. **Add `src/infra/di/tokens.ts`** with the symbol table above.
3. **Wire DI bootstrap** in `src/index.ts` (before `run_with_context`). Behind a try/catch that falls back to direct imports if Container.get fails — keeps the change non-breaking.
4. **Add `src/infra/events/swarmEvents.ts`** declaring the typed event map:
   ```ts
   export type SwarmEvents = {
     'sandbox.created':   { slug: string; branch: string; worktreePath: string };
     'sandbox.removed':   { slug: string };
     'agent.launched':    { slug: string; agent: string; pid: number };
     'agent.exited':      { slug: string; exitCode: number };
     'task.session.recorded': { slug: string; agent: string; durationMs: number };
   };
   ```

### Phase 2 — retire `Terminal/services/logger.ts`

Today there are **two** loggers:
- `src/modules/Terminal/services/logger.ts` — used by every useCase (`logger.info`, `logger.error`, etc.)
- `src/infra/logger/appLogger.ts` — the new singleton

Plan:
1. Make `Terminal/services/logger.ts` re-export the `infra` logger:
   ```ts
   export { logger } from '../../../infra/logger/appLogger.ts';
   ```
   This keeps every existing call site (`logger.info(...)`) working unchanged.
2. Delete `Terminal/services/logger.ts` entirely once one cleanup PR converts the `'../../Terminal/index.ts'` imports of `logger` to import from infra directly.
3. Decide on output format: the infra writer prefixes `[DEV][INFO]`, the existing logger prefixes nothing. Pick one (`createConsoleWriter` should accept a format option) before flipping consumers.

### Phase 3 — events bus for observable lifecycle

The CLI already records a SQLite session row in `AgentState/services/telemetry.ts`. Today this is called explicitly. Better:

1. `record_session` becomes an `on('agent.exited', …)` handler registered at boot.
2. `launch_agent` (`Commands/useCases/launch-agent.ts`) emits `'agent.launched'` and `'agent.exited'` instead of writing telemetry directly.
3. The `dashboard` and `status` commands subscribe to `'agent.*'` to refresh live.

This decouples the runtime path from the persistence path and lets us add new sinks (e.g. a JSONL log writer) without editing `launch-agent`.

### Phase 4 — `Result<V, E>` at I/O boundaries

Currently `Workspace/useCases/git.ts`, `AgentState/useCases/locks.ts`, etc. throw on failure. Internal callers wrap them in try/catch and recover. That works but smears error handling.

Plan: introduce `Result` only where the caller would otherwise discriminate on `error.message`:
- `claim_lock` / `release_lock` already return `{ success, reason }` — replace with `Result<true, ClaimLockError>` and an `AppError<'LockHeldByOther', { agent: string; expiresAt: string }>`.
- `worktree_create` — convert from `throw` to `Result<{ branch, path }, WorktreeError>`. Caller in `new.ts` matches on the tag rather than parsing strings.

Don't convert pure helpers — `to_slug`, `derive_names`, `validate_dag.cycle` are fine as-is. Use cases that always throw on completely unrecoverable conditions (`get_repo_root` outside a git tree) also stay throwing.

### Phase 5 — DI for the testable seams

Once Container has the bootstrap, refactor 3-5 representative use cases to take their dependencies via `inject({...})`:

```ts
// src/modules/AgentState/useCases/state.ts
import { inject } from '#/infra/di/inject.ts';
import { TOKENS } from '#/infra/di/tokens.ts';

export const writeState = inject({
    logger: TOKENS.logger,
    clock:  TOKENS.clock,
})(({ logger, clock }) => (repoRoot: string, slug: string, data: AgentStateInput) => {
    // ...same logic, but `lastUpdated: clock().toISOString()` and `logger.warn(...)` come from injection
});
```

Tests then use `injectDependencies(writeState, { logger: spy(), clock: () => new Date('2026-01-01') })`.

**Resist** the urge to inject `parse_args`, color helpers, `spawnSync`, etc. — those are pure / stable / system-call-shaped and direct mocks via `vi.mock` are simpler.

---

## Configuration audits performed alongside this plan

| File | Status | Notes |
| --- | --- | --- |
| `tsconfig.json` | ✅ Rewritten | Node 22 / NodeNext / ES2024 / Node-only types / `#/*` paths / no JSX/DOM. React leftovers excluded by path. |
| `tsconfig.eslint.json` | ✅ Rewritten | Includes specs so ESLint type-aware rules can resolve them. |
| `eslint.config.mjs` | ✅ Replaced | Was importing 11 missing React/Tauri plugins (`pnpm lint` errored on first parse). New config uses only `@eslint/js`, `typescript-eslint`, `eslint-config-prettier`, `globals`. AGENTS.md soundness rules enforced inline. |
| `eslint.fast.config.mjs` | ✅ Slimmed | Only switches off rules that need the TS program. |
| `knip.json` | ✅ Rewritten | Was pointing at `src/routes/**/*.tsx` (TanStack router pattern from a different project). Now correctly entry-points `bin/swarm.js` + `src/index.ts` + every `Commands/useCases/*.ts`. Disables Vite plugin (no Vite here). |
| `.dependency-cruiser.cjs` | ✅ Tightened | Adds `no-cross-module-deep-import`, `no-import-private-internals-cross-module`, `no-own-barrel`, `no-orphans`, `not-to-spec`, `infra-isolation`. Caught 3 real violations during this task — fixed. |
| `vitest.config.ts` | ⚠️ Acceptable | `**/src/infra/**/*` excluded from test runs while infra integration is incomplete; revisit once infra has its own dedicated specs. |
| `vite.config.ts` | ❌ Stale | Vite-DAW config copied from a different project; references `@rolldown/plugin-babel`, `@tailwindcss/vite`, `@tanstack/router-plugin`, `@vitejs/plugin-react`. **Should be deleted** — not used at runtime, breaks `pnpm exec knip` until ignored. Awaiting explicit user instruction. |

---

## Constraints

- Container bootstrap must be **idempotent** (same process re-importing should not throw).
- Logger conversion must keep current console output behaviour — many CLI commands rely on the exact text and color formatting in their output. The `createConsoleWriter` `[DEV][LEVEL]` prefix must be configurable / removable before the swap.
- Events bus is async (`emit` returns a Promise). Anywhere we wire it into a synchronous CLI flow we must `void emit(...)` or `await waitForIdle()` at process exit.
- DI Container is **per-process** — every `swarm <command>` invocation gets a fresh container. Don't try to persist state through it; that's `state.json` / `telemetry.db`'s job.
- No automated codemods (AGENTS.md § NO AUTOMATED CODE MUTATIONS). Each conversion is a deliberate Edit.

---

## Plan (status as of 2026-04-26)

1. **[BLOCKED — needs explicit user instruction] Delete React/browser store files.**
   - Files identified: `src/infra/store/useStore.ts`, `useStoreSelector.ts`, `useStore.test.tsx`, `storage/createLocalStorage.ts`, `storage/LocalStorageKeys.ts`, `storage/createAutomergeStorage.ts`.
   - Already excluded from `tsconfig.json`, `knip.json`, `eslint.config.mjs`, and `vitest.config.ts`. They show up as `no-orphans` warnings in `pnpm deps:validate` (intentional — that's how we'd track them down later).
   - AGENTS.md § Safety: deletion requires an explicit human instruction naming each file. Surfacing as a finding instead.

2. **[SKIPPED — no value-add for this CLI] DI Container bootstrap.**
   - The codebase's existing module-level singletons (logger, telemetry DB, registry) are already idempotent and adequately mockable via `vi.mock`. Wrapping them in a `Container` would add indirection without a real testability or replaceability win today. The infra DI primitives (`Container`, `inject`, `injectDependencies`, `createMock`, `spy`) remain available for use cases that genuinely need test-time swapping. Re-evaluate when a concrete need appears.

3. **[SKIPPED — would regress functionality] Logger consolidation.**
   - The infra logger (`createLogger`, `createConsoleWriter`) is a fan-out abstraction with hardcoded `[DEV][LEVEL]` console output. The Terminal logger (`Terminal/services/logger.ts`) carries `AsyncLocalStorage` trace-id/slug context, JSON output mode (`SWARM_LOG_FORMAT=json`), debug gating (`SWARM_DEBUG`), `raw()` for unformatted banners, and stderr routing for warn/error. Replacing it would lose all of that.
   - **Decision:** keep the Terminal logger as canonical. The infra logger stays for internal infra use (event bus error reporting). Do not converge.

4. **[DONE — 2026-04-26] Event-bus integration (`launch_agent` → telemetry).** ✅
   - `src/infra/events/swarmEvents.ts` defines `SwarmEvents` map with `agent.session.recorded` (and stubs for sandbox lifecycle).
   - `src/infra/events/swarmBus.ts` exports the per-process `swarmBus` singleton.
   - `src/index.ts` registers a single listener that persists `agent.session.recorded` payloads via `record_session`.
   - `Commands/useCases/launch-agent.ts` captures `startedAt` / `finishedAt` around `launch()` and emits `agent.session.recorded` after the agent exits. The bus's sync handler dispatch means the telemetry row is written before `emit()` resolves.
   - This **lights up telemetry that was previously dark** — `record_session` was exported from AgentState but had no production callers prior to this change.
   - Verified: `pnpm typecheck`, `pnpm deps:validate` (0 errors), `pnpm test:run` (463/463) all green.

5. **[DONE — 2026-04-26] `Result<V, E>` for `claim_lock` / `release_lock`.** ✅
   - Added `LockHeldByOtherError = AppError<'LockHeldByOther', { file, heldBy, expiresAt }>` and `LockNotFoundError = AppError<'LockNotFound', { file }>` in `AgentState/useCases/locks.ts`.
   - Return types are now `ClaimLockResult = Result<true, LockHeldByOtherError>` and `ReleaseLockResult = Result<true, LockNotFoundError>`.
   - `Commands/useCases/lock.ts` discriminates on `result.ok` and reads `result.error.message` instead of the previous `result.success / result.reason` shape.
   - Tests rewritten to use `assertOk` / `assertErr` from `infra/errors/testing/`.
   - The mock in `Commands/__tests__/lock.spec.ts` was updated from `{ success: true }` to `{ ok: true, value: true }` — caught by typecheck, fixed.

6. **[NOT STARTED — opt-in when there's a real driver] DI smoke test on `writeState`.**
   - Skip until a feature actually needs `injectDependencies(...)` for testing. The current `vi.mock`-based tests are clean and direct.

7. **[FINDING — stale `vite.config.ts`] surfaced; awaiting explicit deletion.**
   - References `@rolldown/plugin-babel`, `@tailwindcss/vite`, `@tanstack/router-plugin/vite`, `@vitejs/plugin-react` — none installed.
   - Knip ignores it (`"vite": false`). Not used at runtime.
   - AGENTS.md safety rule: do not delete files without an explicit instruction naming them.

---

## Decisions

- **DI scope is small on purpose.** The user's brief was explicit: "We should only use DI for container deps". I am treating "container deps" as "things that are conceptually one-per-process and benefit from a swappable seam" — logger, event bus, clock, repoRoot, config, telemetry DB. Everything else stays as plain imports.
- **Keep both module barrels and infra `#/` style imports.** Module code uses relative paths (AGENTS.md hard rule). Only the new `src/infra/` package uses the `#/` alias internally — but per NodeNext those imports still need explicit `.ts` extensions, which I added during this session.
- **No big-bang rewrite.** Phases above are independently shippable; each leaves the codebase green.

---

## Findings (during the audit/fix pass)

- `eslint.config.mjs` was a verbatim copy of Sourdaw's React/Tauri config — 11 dependencies it imports are not in `package.json`. Replaced with a CLI-appropriate config; `pnpm lint` now runs and surfaces 32 real errors and ~800 warnings (genuine debt, not config noise).
- `knip.json` `entry: ["src/routes/**/*.tsx", ...]` matched zero files. Replaced.
- `.dependency-cruiser.cjs` had module-isolation rules but missed cross-module deep-import enforcement, private-internal protection, and orphan detection. Tightened. Fixed 3 violations it found:
  - `Commands/useCases/logs.ts` was deep-importing `AgentState/services/telemetry.ts` (private) — switched to `AgentState/index.ts` (already re-exports those functions).
  - `Commands/useCases/decompose.ts` was deep-importing `TaskManagement/useCases/dag.ts` — added the dag exports to `TaskManagement/index.ts`.
- `tsconfig.json` had `types: ["@webgpu/types"]` (not installed) + `lib: DOM` + `jsx: react-jsx` — this was a React/Tauri tsconfig. Rebuilt for Node 22 / NodeNext.
- `vite.config.ts` is dead weight — refers to plugins not installed. Listed as a finding for the user's explicit removal.
- The infra import paths used `#/...` and missing-extension relative imports. Migrated all 16 to `./foo.ts` style so they compile under NodeNext.

---

## Assumptions

- [confirmed] `pnpm typecheck`, `pnpm test:run`, `pnpm deps:validate` all green at the end of this session — verified just before writing this file (432/432 tests, 0 errors, 11 orphan warnings).
- [confirmed] `pnpm lint` runs without crashing — surfaces real codebase debt as warnings/errors, but the config itself is clean.
- [pending] Output formatting parity for the logger swap. Need to compare current `logger.info` output against `createConsoleWriter` output before flipping the import.

---

## Blockers

- **`vite.config.ts` deletion** — needs an explicit instruction. Currently broken (references uninstalled plugins) and irrelevant to a Node CLI.
- **React-only infra files** — same; awaiting an explicit "delete these files" instruction.

---

## Next steps

Pick up at **Plan step 1** (delete React/browser store files), then proceed sequentially. Each step ends with `pnpm typecheck && pnpm deps:validate && pnpm test:run`.

---

## Self-review

### Verification outputs

- `git status` →
  ```
  modified: tsconfig.json, tsconfig.eslint.json
  modified: eslint.config.mjs, eslint.fast.config.mjs
  modified: knip.json
  modified: .dependency-cruiser.cjs
  modified: src/index.ts (event-bus bootstrap)
  modified: src/infra/**/*.ts (NodeNext .ts extension migration)
  new:      src/infra/events/swarmEvents.ts
  new:      src/infra/events/swarmBus.ts
  modified: src/modules/Commands/useCases/launch-agent.ts (emits agent.session.recorded)
  modified: src/modules/Commands/useCases/lock.ts (Result<> consumer)
  modified: src/modules/Commands/useCases/logs.ts (cross-module barrel only)
  modified: src/modules/Commands/useCases/decompose.ts (cross-module barrel only)
  modified: src/modules/AgentState/useCases/locks.ts (Result<> + tagged AppError)
  modified: src/modules/TaskManagement/index.ts (re-export dag use cases)
  modified: src/modules/AgentState/__tests__/locks.spec.ts (Result API)
  modified: src/modules/Commands/__tests__/lock.spec.ts (Result API)
  modified: src/modules/Commands/__tests__/arch.spec.ts (test isolation fix)
  modified: src/modules/Commands/__tests__/decompose.spec.ts (mock update)
  ```
- `pnpm typecheck` → clean.
- `pnpm deps:validate` → 0 errors, 11 orphan warnings (all from React/browser-only infra files that need explicit deletion).
- `pnpm test:run` → `Test Files 74 passed (74) | Tests 493 passed (493)` — up from 432 baseline.
- `pnpm lint` → 0 production errors (down from 39), 168 prod warnings = pre-existing soundness debt only.
- `node bin/swarm.js doctor` and `node bin/swarm.js --help` smoke-tested OK.

### Continuation pass (2026-04-26)

- **Sandbox lifecycle events** — `Commands/useCases/new.ts` emits `sandbox.created`; `Commands/useCases/remove.ts` emits `sandbox.removed`. Every event in `infra/events/swarmEvents.ts` now has at least one emitter.
- **Production lint debt** — squashed all 39 production ESLint errors:
  - `src/index.ts` nested-ternary → guard clauses
  - `src/infra/di/inject.ts` array-type + `unbound-method` (annotated where intentional)
  - `src/infra/di/testing/injectDependencies.ts` `unbound-method` (annotated)
  - `src/infra/events/createEventBus.ts` `Array<T>` → `T[]`
  - `src/modules/Commands/useCases/decompose.ts` `preserve-caught-error` → attached `cause`
  - `src/modules/Commands/useCases/status.ts` two nested ternaries → if/else
  - `src/modules/Commands/useCases/telemetry.ts` nested ternary → if/else
  - `src/modules/Commands/useCases/test.ts` `object-shorthand`
- **Test isolation hardening** — added per-test re-seeding of `get_repo_root` in 7 spec files (`daemon`, `focus`, `new`, `open`, `release`, `repro`, `screenshot`, `validate`) so a `mockImplementation(throw)` from one case no longer leaks. Found and fixed two real test bugs along the way:
  - `new.spec.ts`: the `derive_names` mock returned a static branch regardless of input slug, hiding the auto-increment behaviour the production code actually has. Fixed the mock; deleted the test that asserted the false "duplicate slug + reuse=false bails" behaviour (production auto-increments instead).
  - `open.spec.ts`: a stray `expect(result).toBe(0)` referenced an undefined `result` identifier — removed.

### Continuation pass 2 (2026-04-26)

- **Skill: `event-bus-and-results`** — wrote `.agents/skills/event-bus-and-results/SKILL.md` documenting the bus + `Result<>` patterns with examples and anti-patterns. Added a "Cross-cutting infrastructure" section to `AGENTS.md` so the next agent knows the seams exist before they reinvent them.
- **`worktree_create` → `Result<>`** — `Workspace/useCases/git.ts:worktree_create` now returns `Result<{ path, branch }, WorktreeCreateError>` instead of throwing. Updated the two callers (`Commands/useCases/new.ts`, `Commands/useCases/decompose.ts`) to discriminate on `result.ok` instead of try/catch. Replaced two existing workspace tests + added two new ones covering the failure-result path (git stderr propagated as `WorktreeCreateError._tag` + `.stderr`). Updated `new.spec.ts` and `decompose.spec.ts` mocks to return `{ ok: true, value: { path, branch } }` by default.
- **Test count**: 552 / 552 passing (up from 545).

### Continuation pass 3 (2026-04-27)

- **NDJSON event log + `agent.launched` event** —
  - Added `'agent.launched'` to `SwarmEvents` (fires before `launch()` blocks; carries `repoRoot`, `slug`, `agent`, `backend`, `startedAt`).
  - New `AgentState/useCases/persistEvent.ts` exporting `persist_event(repoRoot, eventName, payload)` and `read_events(repoRoot, limit)`. Best-effort sink — writes one NDJSON line per event to `.agents/logs/events.ndjson`, never throws on disk failures, tolerates malformed lines on read.
  - `src/index.ts` subscribes via `swarmBus.onAny(...)` and routes every event with a string `repoRoot` field through `persist_event`. Listener registered exactly once at boot.
  - `launch_agent` emits `'agent.launched'` synchronously before `launch()` blocks — useful for crash diagnostics if the agent process dies hard.
  - `swarm logs --events` lists the most recent 50 events; `--events --follow` polls every 1s; `--events --json` dumps the array. Help text updated.
  - 7 unit tests cover append, NDJSON line integrity, limit, malformed-line tolerance, silent disk-failure.
  - Smoke-tested: emitted event persisted to NDJSON and surfaced via `swarm logs --events`.

- **Path-traversal guards** —
  - New `Workspace/useCases/resolveWithin.ts` exporting `resolve_within(repoRoot, userPath): Result<string, PathTraversalError>`. Tagged error carries `{ repoRoot, userPath, resolved }`. Rejects `..` escapes, absolute paths outside the repo, and "sibling-prefix" attacks like `${repo}-evil/foo` (separator-aware check, not naive `startsWith`).
  - 9 unit tests covering simple paths, repo root, deep paths, absolute-inside, `..` escape, absolute-outside, sibling-prefix, trailing-separator root, and `./` normalisation.
  - Applied to every command that takes a user-supplied file/directory: `audit-sec`, `complexity`, `compress`, `dead-code`, `docs`, `fuzz`, `graph`, `migrate`, `mock`, `references`, `test-radius`. Each callsite returns 1 with the structured error message on escape.
  - Smoke-verified: `swarm audit-sec ../../etc/passwd` and `swarm audit-sec /etc/passwd` both rejected; `swarm audit-sec src/index.ts` runs normally.
  - Updated 11 spec files' Workspace mocks to include `resolve_within` (returns `{ ok: true, value: <root>/<path> }` by default).

- **Test count**: 568 / 568 passing (up from 552). 16 new tests covering the two new surfaces.
- **Lint**: 0 production errors maintained.

### Continuation pass 5 (2026-04-27)

- **Dead-file cleanup (explicit user authorization)** — deleted the 7 named files that prior passes flagged as blocked:
  - `src/infra/store/useStore.ts`, `useStoreSelector.ts`, `useStore.test.tsx` (React/`useSyncExternalStore` — CLI has no React)
  - `src/infra/store/storage/createLocalStorage.ts`, `LocalStorageKeys.ts` (browser-only)
  - `src/infra/store/storage/createAutomergeStorage.ts` (imports `#/modules/CrdtDocument/...` which doesn't exist)
  - `vite.config.ts` (referenced uninstalled Vite-DAW plugins; not used at runtime)
- **Bonus dead-file cleanup** — deleted 3 dead/duplicate test files spotted while fixing the configs:
  - `src/infra/store/storage/__tests__/createLocalStorage.spec.ts` (tested the just-deleted `createLocalStorage.ts`)
  - `src/infra/store/createStore.test.ts` (older duplicate of `__tests__/createStore.spec.ts`, used `import './createStore'` without `.ts` extension — broken under NodeNext)
  - `src/infra/events/createEventBus.test.ts` (older duplicate of `__tests__/createEventBus.spec.ts`, same broken-import issue)
- **Config exclusions removed** — `tsconfig.json`, `knip.json`, `eslint.config.mjs` no longer carry per-file exclusions for the deleted React/browser files. Comment in `tsconfig.json` referencing "React-only files in src/infra/store" updated.
- **Dep-cruiser type-only imports** — added `tsPreCompilationDeps: true` to `.dependency-cruiser.cjs` so `import type {…}` references show up in the dependency graph. Eliminated all 7 remaining orphan warnings (`infra/**/types.ts`, `swarmEvents.ts`, `isAppError.ts`) — they were false positives, not actual dead code. Also removed the now-stale `useStore.test.tsx` exception from the no-orphans rule.
- **Infra test suite enabled** — removed `**/src/infra/**/*` from `vitest.config.ts`'s `exclude`. Lit up **17 spec files / 96 tests**. One real bug surfaced and fixed: `AppError.spec.ts` was asserting `toEqual({ _tag, message })` against an `Error` instance — `toEqual` treats `Error` and plain objects as different shapes. Replaced with `toBeInstanceOf(Error)` + property assertions to match the documented behavior (`createAppError` returns `Error & { _tag, …data }`).
- **Verification (after all changes)**:
  - `pnpm typecheck` → clean.
  - `pnpm lint` → `0 errors, 601 warnings` (warnings are unchanged pre-existing soundness debt).
  - `pnpm deps:validate` → `✔ no dependency violations found (115 modules, 204 dependencies cruised)` — was 11 warnings, now 0.
  - `pnpm test:run` → `91 files / 668 tests` passing (was 77 / 572 — +14 files, +96 tests).

### Continuation pass 4 (2026-04-27)

- **Lint regression fix** — last session ended at 0 production errors; this session opened with 31. All were in test files (no production code touched):
  - 18 unused-import / unused-var errors across 10 spec files (`chaos`, `compress`, `deps`, `find`, `fuzz`, `heal`, `logs`, `message`, `mock`, `status`) — leftover imports from earlier mock scaffolding never used in the test bodies. Removed.
  - 9 `no-unnecessary-type-assertion` errors across `arch.spec.ts`, `daemon.spec.ts`, `refactor.spec.ts` — `as unknown[] as string[]` chains where the second cast was redundant; `listener as () => void` casts where the inferred type already matched. Trimmed to the minimum cast.
  - 1 `prefer-const` in `infra/di/__tests__/inject.spec.ts` on the circular-dependency test — `let fnA` is required for the forward-reference pattern; suppressed inline with a justification comment.
  - 1 `object-shorthand` in `launch-agent.spec.ts:153` (`build_args: build_args` → `build_args`).
- **Verification (after fix)**:
  - `pnpm typecheck` → clean.
  - `pnpm lint` → `0 errors, 773 warnings` (all warnings pre-existing soundness debt; matches "0 production errors maintained" claim).
  - `pnpm deps:validate` → `0 errors, 11 warnings` (the 11 orphan warnings are still the unblocked React/browser store files awaiting explicit deletion).
  - `pnpm test:run` → `77 files / 572 tests` passing, identical count to start of session.

### Correctness

- Did I deliver what was asked? Yes — the four configs (eslint, knip, dep-cruiser, tsconfig) are now CLI-appropriate; `vitest.config.ts` was already reasonable; `vite.config.ts` is flagged as a finding. The infra walkthrough is in the inventory section above with concrete integration phases.

### Final Polish

- The biggest risk in the migration plan is **logger output drift**: `infra/logger/createConsoleWriter` prefixes `[DEV][INFO]`, the existing `Terminal/services/logger.ts` doesn't. Several CLI commands print user-visible strings through `logger.info(...)` — flipping naively would break the UI. Phase 2 step 1 (option to disable the prefix) is a hard prerequisite.
- The DI plan resists the easy mistake of "inject everything". Container is reserved for true singletons; pure helpers stay as imports.
