---
type: finding
id: observability-stack
status: accepted
created: 2026-06-08
updated: 2026-06-08
origin_obligations:
origin_traces:
pass: promote
profile:
reviewer_or_tool: migrated from pre-pivot research (.agents/research/observability-telemetry.md @ pre-cleanup; full original in git history)
content_hash: pending:tool
confidence: medium
---

# Finding: the telemetry/observability stack is Pino + SQLite (OTel deferred)

*Lives in: `.agents/memory/findings/` — durable recall, indexed by `memory/INDEX.md` (the load-when map).*

## Claim

swarm-cli's observability stack was evaluated and settled as **Pino** (fast structured NDJSON logging) +
**SQLite** (aggregate metrics / searchable session history, WAL mode), with **`AsyncLocalStorage`**
propagating `trace_id`/`slug` instead of threading them through signatures. **OpenTelemetry was evaluated
and deferred** (the file exporter is experimental and the SDK is too heavy for a self-contained dev CLI).
A standing technical constraint: **`better-sqlite3` requires native compilation (`node-gyp`)** and fails to
install on Windows without build tools — a pure-JS/WASM fallback (`sql.js`) or `bun:sqlite` is the escape
hatch if that bites.

## Evidence

- Source: `.agents/research/observability-telemetry.md` (pre-pivot research; full survey + tradeoff table recoverable in git history).
- Already partly implemented: `src/modules/Terminal/services/logger.ts` (unified logger), `src/modules/AgentState/services/telemetry.ts` (SQLite telemetry), `src/modules/Commands/useCases/logs.ts` (query/tail).
- Caveats recorded: log files grow unbounded (needs rotation / `swarm logs --prune`); telemetry DB can leak secrets if stdout is stored (sanitise/exclude); SQLite multi-writer perf degrades — buffer + flush for high-frequency events.

## Applies when

- Designing or extending swarm-core / cli telemetry, logging, or the session store; choosing whether to add OpenTelemetry; or diagnosing a `better-sqlite3` install failure.

## Does not apply when

- A future need for cross-machine distributed tracing or an external observability platform appears — that reopens the OpenTelemetry decision.

## Related obligations

- (none yet — attaches to a future swarm-core telemetry/ledger spec.)

## Promotion target

- [x] Keep as scoped finding
- [ ] Promote into spec (when a swarm-core observability/ledger spec is authored)

## Status history

- 2026-06-08 — accepted — migrated from pre-pivot `.agents/research/observability-telemetry.md` during the type-folder cleanup; cross-checked against the implemented `logger.ts`/`telemetry.ts`.
