---
type: spec
id: trace
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm trace — record and inspect a task's implementation trace (src/modules/Commands)
owners: []
imports: []
domain: architecture
created: 2026-06-08
updated: 2026-06-08
---

# Spec: swarm trace — record and inspect a task's implementation trace

## Intent

`swarm trace` records and inspects the **implementation trace** for a task: the claim that a change set
satisfies its obligations, bound to evidence. A trace says — for one task — what the change **IMPLEMENTS**
(which obligations), what it **PRESERVES** (which constraints/invariants held), what it **CHANGED** (the
touched surfaces), and the **PROOF** line(s) that bind each obligation to its verification output, together
with the drift provenance the staleness join later reads (`source_hash`, `per_surface_hash[]`, `adapter`,
`verdict`, `tier`). Per ADR-0050 the **PR is the default trace** for a code repo; `swarm trace` is the
**opt-in structured trace** — a `Commands` use-case that *writes* (`record`) and *renders* (`show`) one
trace record per task for the audit-heavy / tooling case. v1 emits and displays the record from what the
task asserts; it does **not** re-run proofs or compute staleness (verify/drift concerns).

## Non-goals

- Not re-running the bound proofs, recomputing hashes, or judging the change — `verify` runs proofs,
  `review` issues the verdict. `trace` records the claim and renders it; it does not adjudicate.
- Not the staleness / drift comparison (re-hash the source, flip `PASS` to `STALE`) — a `drift`/`review`
  concern, deferred (Q-001, Q-002).
- Not parsing or repairing the spec — `Sol` parses; a human authors. `trace` reads the IR/obligation ids
  it binds against, it does not redefine them.
- Not the merge gate or worktree allocation — separate `review`/`worktree` concerns.

## Context

A `Commands` use-case on the one dispatch path (ADR-0001: one tool, all code in `/src`, no monorepo), home
`src/modules/Commands` with `useCases/trace.ts` and the `swarm trace record <task>` / `swarm trace show
<task>` subcommands. The trace record's shape (the `TRACE` block — `IMPLEMENTS`/`PRESERVES`/`CHANGED`/
`PROOF` — plus the seven G11 provenance fields per binding) is fixed by the SOL grammar and IR reference
(`.agents/reference/sol.md`, `ir.md`) and the trace artifact template (`.agents/templates/trace.md`); this
spec contracts the command that writes/renders it, it does not redefine them. **No runtime semantics for
hashing:** under ADR-0055 every `source_hash`/`per_surface_hash[]` is **tool-emitted**; a by-hand record
writes a documented placeholder (`pending:tool` or a git blob/commit ref), never a fabricated digest.
**Placement (ADR-0050):** the trace is **execution scratch — gitignored** (`.agents/tasks/` scratch) or, for
the durable claim, the **PR**; `swarm trace` writes to the scratch location, never littering the code repo.
Errors use the repo's `Result` + `AppError` (`src/infra/errors`).

## Interfaces

INTERFACE IF-001:
`run_trace_record` RETURNS `Result<TraceRecord, TraceFailure>`
ACCEPTS:
  - `task: string` (the task id/path whose trace is recorded)
ERRORS:
  - TraceFailure(reason=task-not-found)
  - TraceFailure(reason=no-bound-obligations)
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_returns_trace_record

INTERFACE IF-002:
`run_trace_show` RETURNS `Result<string, TraceFailure>`
ACCEPTS:
  - `task: string` (the task id/path whose trace is rendered)
ERRORS:
  - TraceFailure(reason=trace-not-found)
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#show_renders_existing_trace

## Obligations

REQ AC-001:
WHEN `swarm trace record <task>` runs against a task with bound obligations
THE command MUST write one `TRACE` block per claimed obligation, each carrying `IMPLEMENTS <obligation-id>`, `PRESERVES <constraint/invariant ids>`, `CHANGED <touched surfaces>`, and `PROOF <verification output reference>`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_emits_trace_block_per_claim
DEPENDS ON IF-001
RISK high

REQ AC-002:
THE command MUST record, per obligation binding, the drift-provenance fields `source_hash`, `per_surface_hash[]`, `adapter`, `verdict`, `tier`, `origin_obligations[]`, and `origin_traces[]`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_writes_provenance_fields
DEPENDS ON AC-001
RISK high

REQ AC-003:
WHEN a hash field cannot be computed at record time (no tool emitted it)
THE command MUST write a documented placeholder (`pending:tool` or a git blob/commit ref) into `source_hash`/`per_surface_hash[]`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#missing_hash_is_placeholder_not_digest
DEPENDS ON AC-002
RISK high

REQ AC-004:
WHEN `swarm trace record <task>` runs and a trace record already exists for that task
THE command MUST update the existing record in place rather than create a duplicate
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_updates_existing_in_place
DEPENDS ON AC-001
RISK medium

REQ AC-005:
WHEN `swarm trace show <task>` runs
THE command MUST render the task's trace record — the `TRACE` claims, the per-binding provenance, and the verification matrix (`ID → required proof → actual proof → status`)
AND THE command MUST exit non-zero with a `trace-not-found` error WHEN no trace record exists for that task
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#show_renders_record_and_errors_when_absent
DEPENDS ON IF-002
RISK medium

REQ AC-006:
WHEN a change touches a surface outside the task's bound obligations
THE command MUST record it under `Unassigned changes` with a reason and the authorizing id (or `none`), never silently fold it into a claimed `TRACE` block
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#unassigned_change_is_recorded_separately
DEPENDS ON AC-001
RISK medium

## Constraints

CONSTRAINT C-001:
THE command MUST NOT compute, infer, or fabricate a `source_hash`/`per_surface_hash[]` digest at record time
BECAUSE hashes are tool-emitted (ADR-0055): the trace command has no shipped hasher, so any digest it writes would be fabricated, and a hand-written hash is untrusted until a tool recomputes it — a placeholder is the only honest record
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#no_fabricated_digest_written

CONSTRAINT C-002:
THE command MUST NOT write the trace record into a git-tracked path in the code repo
BECAUSE the trace is execution scratch (gitignored) or the PR (ADR-0050); writing it into a tracked path litters the pristine code repo with transient claims that belong in scratch or flow back as a PR
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#trace_written_to_gitignored_scratch

CONSTRAINT C-003:
THE command MUST NOT re-run a bound proof or recompute a `verdict` at record time
BECAUSE running proofs is the `verify` step and issuing the verdict is `review`; a trace that re-judges would duplicate and could contradict those steps — `record` captures the claim as asserted, no more
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_does_not_rerun_proofs

CONSTRAINT C-004:
THE command MUST NOT emit a `verdict`, `tier`, or block `kind` outside Swarm's closed sets (the 4 core verdicts, the 9 proof types, the 7 block types)
BECAUSE those sets are the language reference's; inventing a value forks the language (the `swarm-cli` no-semantic-fork constraint, made concrete here)
VERIFY BY static:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#emitted_values_in_closed_sets

## Invariants

INVARIANT I-001:
every `TRACE` block written by `record` MUST be recoverable, byte-for-byte in its binding content, by a subsequent `show` of the same task (record/show round-trips losslessly for binding content)
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_show_roundtrips

INVARIANT I-002:
every `IMPLEMENTS <obligation-id>` in a written trace MUST reference an obligation id that exists in the task's bound spec (no claim against a non-existent obligation)
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#implements_references_resolve

## Questions

QUESTION Q-001 [non-blocking]:
The proof RE-RUN — does `swarm trace` ever invoke the `cmd*` adapters itself, or does it always read a verify-step output? v1 records the `PROOF` reference as asserted and never re-runs; the re-run boundary belongs to `verify`/`check`.
AFFECTS AC-001

QUESTION Q-002 [non-blocking]:
The staleness comparison — when does a recorded `source_hash` get compared against a freshly tool-emitted hash to flip a `PASS` to `STALE`? v1 records the (placeholder) hash; the compare-and-decorate is a `drift`/`review` concern, out of this spec.
AFFECTS AC-002

QUESTION Q-003 [non-blocking]:
Where exactly does the gitignored scratch trace live — under `.agents/tasks/<task>/trace.md`, or a sibling of the task frame — and how is it keyed to the task id? (C-002 fixes only that it MUST be a gitignored path, not the precise filename.)
AFFECTS C-002

## Verification coverage

Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`). All obligations are
**pending** (v1, not yet implemented): IF-001, IF-002, AC-001–AC-006, C-001–C-004, I-001, I-002 bind to
`src/modules/Commands/__tests__/trace.spec.ts`.

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_returns_trace_record        |
| IF-002 | contract:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#show_renders_existing_trace         |
| AC-001 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_emits_trace_block_per_claim      |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_writes_provenance_fields         |
| AC-003 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#missing_hash_is_placeholder_not_digest  |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_updates_existing_in_place        |
| AC-005 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#show_renders_record_and_errors_when_absent |
| AC-006 | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#unassigned_change_is_recorded_separately |
| C-001  | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#no_fabricated_digest_written            |
| C-002  | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#trace_written_to_gitignored_scratch     |
| C-003  | test:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_does_not_rerun_proofs            |
| C-004  | static:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#emitted_values_in_closed_sets         |
| I-001  | property:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#record_show_roundtrips              |
| I-002  | property:cmdTest:src/modules/Commands/__tests__/trace.spec.ts#implements_references_resolve        |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| increment 1 (pending) — record core | IF-001, AC-001, AC-002, AC-003, C-001, C-003, C-004 |
| increment 2 (pending) — show + round-trip | IF-002, AC-005, I-001, I-002 |
| increment 3 (pending) — update + unassigned + placement | AC-004, AC-006, C-002, Q-003 |

## Distillation loss statement

### Preserved

- The trace contract: one `TRACE` block per claim (`IMPLEMENTS`/`PRESERVES`/`CHANGED`/`PROOF`), the seven
  G11 provenance fields per binding, record/show round-trip, unassigned-change capture, and the two honesty
  rules — hashes are placeholders not fabricated digests (C-001/AC-003), and `record` never re-runs/​re-judges
  (C-003).
- ADR-0050 placement (gitignored scratch or the PR, never the pristine code repo) as a testable constraint
  (C-002), and the `swarm-cli` no-semantic-fork constraint made concrete (C-004).

### Dropped

- The exact `TRACE` block and provenance-table JSON/markdown layout — it is the trace artifact template's
  (`.agents/templates/trace.md`); this spec binds the command to *write/render that shape*, not restate it.
- The full G11 staleness-join algorithm — out of v1 scope (Q-002); this spec records the fields the join
  will later read.

### Still uncertain

- Whether `trace` ever invokes adapters itself or always reads a verify-step output (Q-001), and when the
  staleness compare flips a `PASS` to `STALE` (Q-002) — both deferred to `verify`/`drift`/`review`.
- The precise gitignored scratch path/filename and task-id keying (Q-003).
