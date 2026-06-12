---
name: event-bus-and-results
description: Load before adding cross-cutting events to the CLI lifecycle (sandbox/agent/task), or before changing an I/O boundary that today throws or returns `{ success, reason }`. Covers when to emit on `swarmBus`, when to return `Result<V, AppError>`, and when to leave `throw` alone.
---

# SKILL: event-bus-and-results

## Purpose

This skill exists because Swarm has two new cross-cutting primitives that didn't exist a week ago, and agents who don't know about them will keep wiring direct calls (telemetry inside `launch_agent`, `{ success, reason }` shapes from new I/O ops) instead of going through the seams. Both habits *work*, but both make the next change harder.

What this subsystem IS:

- `src/infra/events/swarmBus.ts` — a per-process typed event bus (`EventBus<SwarmEvents>`). Synchronous handlers execute inline before `emit()` resolves, async handlers run via `Promise.allSettled`.
- `src/infra/errors/createAppError.ts` + `result.ts` — tagged errors and a `Result<TValue, TError>` discriminated union.
- The seam where lifecycle events get persisted (telemetry SQLite) and where I/O failures get communicated to callers without throwing.

What this subsystem IS NOT:

- A general pub/sub bus for arbitrary cross-module function calls. Use direct imports for that.
- A try/catch replacement. `throw` is still correct for genuinely unrecoverable errors (e.g. `get_repo_root()` outside a git tree — there's no value in forcing every caller to discriminate).
- A DI container in disguise. The bus and the `Result` helpers are values, not container deps.

---

## Architectural role

What it owns:

- The canonical event taxonomy in `src/infra/events/swarmEvents.ts` (`agent.session.recorded`, `sandbox.created`, `sandbox.removed`, …).
- The shape of typed errors at I/O boundaries that need programmatic handling.

What it does not own:

- The console output for failures — that's still the caller's job (`logger.error(red(result.error.message))`).
- The trace context (`SWARM_LOG_FORMAT=json`, slug, trace_id) — that lives on the `Terminal` logger.

What it depends on:

- Nothing in `src/modules/`. `src/infra/*` must stay leaf-level — `infra-isolation` rule in `.dependency-cruiser.cjs` enforces this.

What depends on it:

- `src/index.ts` registers the canonical telemetry listener at boot.
- `Commands/useCases/launch-agent.ts`, `new.ts`, `remove.ts` — current emitters.
- `AgentState/useCases/locks.ts` — current `Result<>` producer.

---

## Core rules

1. **One event map.** New event types go in `src/infra/events/swarmEvents.ts`. Don't define event names inline at the emit site — the type system can't catch typos that way.

2. **Every declared event has at least one production emitter.** If you add an event to the map and don't emit it from a useCase in the same change, delete the entry. The map is not a wishlist.

3. **Subscribers register at boot, not at use-site.** All `swarmBus.on(...)` calls happen in `src/index.ts` before `main()` runs. Use cases emit; they do not subscribe. This keeps the side-effect graph readable: emitters fan out, listeners are colocated.

4. **`void emit(...)` from sync flows; `await emit(...)` only when you need handler completion to be observable.** `emit` returns a `Promise<void>` because async handlers exist, but synchronous handlers run inline before that promise even resolves. The `agent.session.recorded` row is persisted before `launch_agent` returns even though it uses `void emit(...)`.

5. **`Result<V, E>` is for boundaries where the caller would otherwise discriminate on `error.message`.** If the only thing the caller does with a thrown error is `console.error(e.message)`, keep `throw` — `Result` adds ceremony without buying anything.

6. **Tagged errors carry structured data, not formatted strings.** `LockHeldByOtherError` carries `{ file, heldBy, expiresAt }`, not just a pre-rendered sentence. Callers format the message; the data fields stay machine-readable so future flows (UI, JSON output, retry logic) don't need to re-parse.

7. **Match `Result.ok` exactly once at the boundary.** Don't pass `Result<...>` values up multiple layers — the moment a caller knows what to do with the failure, it discriminates and either propagates a different `Result` or rejects with `logger.error(...)` + `return 1`. The CLI exit-code translation is the boundary.

---

## Patterns

### Emitting a lifecycle event

```ts
// src/modules/Commands/useCases/launch-agent.ts
import { swarmBus } from '../../../infra/events/swarmBus.ts';

const startedAt = new Date().toISOString();
const exitCode = launch(...);
const finishedAt = new Date().toISOString();

void swarmBus.emit('agent.session.recorded', {
    repoRoot, slug, agent: agentName,
    startedAt, finishedAt,
    exitCode: typeof exitCode === 'number' ? exitCode : null,
});
```

The emitter doesn't know — and shouldn't know — that a SQLite row gets written. That's the listener's concern.

### Registering a listener at boot

```ts
// src/index.ts (only this file should subscribe)
import { swarmBus } from './infra/events/swarmBus.ts';
import { record_session } from './modules/AgentState/index.ts';

swarmBus.on('agent.session.recorded', (event) => {
    record_session(event.repoRoot, { /* …mapped fields… */ });
});
```

If a listener is purely a side-effect sink (telemetry, audit log, cache invalidation), it belongs here. If it has internal state, factor it into a function in the relevant module and import it.

### Adding a new event type

```ts
// src/infra/events/swarmEvents.ts
export type SwarmEvents = {
    'agent.session.recorded': { /* … */ };
    'sandbox.created':        { /* … */ };
    'sandbox.removed':        { /* … */ };
    // New event — add here, then add the emitter and the listener in the same PR.
    'task.file.appended':     { repoRoot: string; slug: string; section: string };
};
```

### Returning `Result<V, E>` from an I/O boundary

```ts
// src/modules/AgentState/useCases/locks.ts
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type LockHeldByOtherError = AppError<
    'LockHeldByOther',
    { file: string; heldBy: string; expiresAt: string }
>;

export type ClaimLockResult = Result<true, LockHeldByOtherError>;

export function claim_lock(repoRoot: string, agentSlug: string, files: string[]): ClaimLockResult {
    // … lock resolution …
    if (existing && !is_expired(existing) && existing.agent_slug !== agentSlug) {
        return err(createAppError(
            'LockHeldByOther',
            `File "${file}" is already claimed by ${existing.agent_slug} (expires: ${existing.expires_at}).`,
            { file, heldBy: existing.agent_slug, expiresAt: existing.expires_at }
        ));
    }
    // … success path …
    return ok(true);
}
```

### Discriminating at the CLI boundary

```ts
// src/modules/Commands/useCases/lock.ts
const result = claim_lock(repoRoot, agentSlug, files);
if (result.ok) {
    console.log(green(`Claimed ${files.length} file(s) for ${agentSlug}.`));
    return 0;
}
// result.error is LockHeldByOtherError — typed access to .file, .heldBy, .expiresAt
console.error(red(result.error.message));
return 1;
```

### Asserting on tagged errors in tests

```ts
import { assertOk } from '#/infra/errors/testing/assertOk.ts';
import { assertErr } from '#/infra/errors/testing/assertErr.ts';

const result = claim_lock(tempDir, 'agent-b', ['src/index.ts']);
expect(result.ok).toBe(false);

const error = assertErr(result);
expect(error._tag).toBe('LockHeldByOther');
expect(error.heldBy).toBe('agent-a');
```

Don't substring-match `error.message` — that test breaks every time the message text gets a typo fix. Match on `_tag` and structured fields.

---

## Anti-patterns

### Subscribing from a useCase

```ts
// WRONG — in src/modules/Commands/useCases/somecmd.ts
swarmBus.on('agent.session.recorded', ...);
```

If the listener fires once per process, registering it inside a useCase means it gets registered once per *invocation* of that useCase — duplicated handlers. Register at boot in `src/index.ts`.

### Defining event names as string literals at the emit site

```ts
// WRONG
void swarmBus.emit('agnet.session.recorded', { ... }); // typo, untyped, silent
```

```ts
// RIGHT — keyof TEvents constraint catches the typo at compile time
void swarmBus.emit('agent.session.recorded', { ... });
```

The bus is generic over `SwarmEvents`. Use the typed key — TypeScript will catch the typo.

### Returning a `Result<>` from a function whose only failure mode is unrecoverable

```ts
// WRONG — every caller has to unwrap and bail anyway
function get_repo_root(): Result<string, NotInGitRepoError> { … }
```

If the failure means "the user can't use the CLI at all", `throw` is still correct. The `Result<>` migration is for *recoverable* boundaries (lock contention, missing optional file, network call) where the caller has a real choice.

### Re-formatting a tagged error's `.message` in the caller

```ts
// WRONG
console.error(red(`Could not claim lock: ${result.error.message}`));
```

The error already has a message. Either log `result.error.message` verbatim (and add prefix in the format function), or build a fresh message from the structured fields. Don't duplicate.

### Passing `Result<>` upward instead of discriminating

```ts
// WRONG — pushing the burden up the stack
function commitTask(): Result<true, AppError> {
    const lock = claim_lock(...);
    if (!lock.ok) return lock; // re-typed, leaks Lock errors into a Task surface
    ...
}
```

Discriminate at the boundary that has the most context. The CLI command handler (`Commands/useCases/lock.ts`) decides what exit code maps to a `LockHeldByOther`. Higher layers should not be re-emitting the same error type.

### Using the bus for synchronous request/response

```ts
// WRONG — bus is fire-and-forget; this never works
const session = await swarmBus.emit('query.session', { id }); // emit returns void
```

`emit` returns `Promise<void>`. There's no return-value channel. If you want a query, write a function. The bus is for one-way notifications.

---

## Checklist

Before submitting changes that touch this skill's surface:

- [ ] Every event added to `swarmEvents.ts` has a production emitter and (if persisted) a listener registered in `src/index.ts`.
- [ ] All `swarmBus.on(...)` calls are in `src/index.ts`, never in useCases.
- [ ] If converting an existing throw site to `Result<>`, ALL callers are updated in the same change.
- [ ] Tagged errors carry structured fields, not just a formatted `message`.
- [ ] Tests assert on `_tag` and structured fields via `assertErr`, not on `error.message` substrings.
- [ ] `pnpm deps:validate` passes (specifically: `infra-isolation` rule — infra never imports from `src/modules/`).
- [ ] `pnpm typecheck` passes — the bus's generic `keyof SwarmEvents` constraint must catch every event-name typo.
