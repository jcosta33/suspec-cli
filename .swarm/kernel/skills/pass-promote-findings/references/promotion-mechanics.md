# Promotion mechanics

Deep material for the `promote` pass guide: the full provenance record, the per-status behaviour at the close gate, the two distinct status enums, the validation/rollback mechanics, and a worked queue. This file is referenced by `SKILL.md` rules 4, 5, and 10. It applies the canonical promotion rules — it does not redefine kernel semantics.

## The full provenance record

Every finding that reaches `accepted` or `promoted` MUST carry every field below. A finding without it is chat, not memory.

| Field | What to record |
|---|---|
| `claim` | The one durable fact, stated as a single proposition |
| `evidence` | The file / command / output / source that grounds the claim |
| `origin_obligations[]` | The obligation IDs (`AC-`/`C-`/`I-`/`IF-…`) the finding was discovered against |
| `origin_traces[]` | The `*.swarm.trace.md` entries that produced the evidence |
| `pass` + `profile` | The pass and heuristic profile it was found under (e.g. `review` + `skeptic`) |
| `reviewer_or_tool` | The human reviewer or tool/adapter that confirmed it |
| `timestamp` | When it was promoted |
| `content_hash` | Hash of the cited source/surfaces at promotion time (drives staleness) |
| `confidence` | `high` \| `medium` \| `low` |
| `applies-when` / `does-not-apply-when` | The scope envelope; mirrors the `Load when` of the INDEX entry |

`applies-when` / `does-not-apply-when` and the INDEX `Load when` must agree — they are the same scope statement in two places, and a drift between them means the recall map points at a fact under conditions the fact itself disclaims.

## Two status enums, not one

The **promotion-status** enum (seven values, below) tracks the disposition of one *queue item*. A `finding.md`'s own **`status`** enum — `candidate | accepted | promoted | rejected | stale | superseded` — tracks the life of one *durable artifact*. They are distinct: a finding's status follows the artifact across time (and can go `stale`/`superseded` long after the task closes); a promotion's status resolves *this task's* queue.

## Per-status behaviour at the close gate

The seven promotion statuses do not all play the same role at closure:

- **`pending`** is the unresolved state. **A task MUST NOT close while any item is `pending`.** This is the core gate.
- **`validated`** is a **non-terminal intermediate** in `pending → validated → promoted`. An item parked at `validated` is *still unresolved* for the purpose of closing — it does not satisfy the gate on its own.
- **`rolled-back`** is a **post-promotion disposition**: it records the withdrawal of an already-`promoted` finding, so it is reached *after* promotion, never as a way to resolve a fresh queue item.
- **`promoted` / `deferred` / `rejected` / `blocked`** are **terminal for this task**. Of these, `deferred`, `rejected`, and `blocked` each MUST carry a reason.

## Validation and rollback mechanics

**Authorization is not validation.** A forward-only `pending → promoted`-on-approval model is insufficient because a durable store has three distinct failure points: poisoning at ingestion (a bad fact entering), semantic drift at consolidation (a fact's meaning bending as it merges), and conflict/hallucination at retrieval (a recalled fact contradicting the store or inventing detail). Two additions close the gap.

- **`validated`.** A high-consequence promotion MUST pass `pending → validated → promoted`, where `validated` requires **independent corroboration** — a second finding, a re-run proof, or a reviewer who is *not* the promoting agent (this generalizes the two-finding rule for patterns). A `pending` finding produced by an externally-authored source (the untrusted-source boundary — a rule/config/agent file supplied outside the project is a poisoning vector) MUST NOT skip `validated`.
- **`rolled-back`.** A `promoted` finding later shown poisoned, `CONTRADICTED`, or `STALE` MUST be withdrawable via `rolled-back`. Rollback records a **retraction entry in `memory/INDEX.md`** — not a silent delete; the chain stays auditable — and **re-opens any obligation it had narrowed**. Supersession *replaces* a fact with a better one; rollback *withdraws* a fact that should never have been promoted.

## Staleness of a promoted finding

A `promoted` finding does not stay authoritative forever. It becomes **`stale`** when its `content_hash` no longer matches the cited source/surfaces — the same drift signal behind the `STALE` lifecycle verdict and the spec↔code reconcile. A `stale` finding MUST NOT be relied on as authority; it routes to re-verification or supersession, and a `superseded` finding records its replacement in the INDEX's stale/superseded table. The kernel ships the *fields* (`content_hash`, `origin_traces`); the comparator that recomputes the hash is a harness/CLI concern, manual today.

## What the `promotions/` ledger entry records

A `promotions/` ledger entry under `.swarm/ledger/promotions/` records the durable target each promoted discovery landed at — a spec amendment, an ADR, a finding, a pattern, a glossary entry, or a pass-guide-plus-pointer — and the disposition of every queue item. It is immutable and append-only (a correction is a new entry referencing the one it amends). It introduces no new evidence: it is a projection of the resolved queue into compact, committed history, so `.swarm/generated/` packets can be discarded without severing the backward trace from code to the discoveries that produced it.

## Worked example: a queue with two faces, a validation gate, and a local detail

A `review[profile: skeptic]` pass on an auth-refresh change surfaces four discoveries. The promote pass resolves them:

| # | Discovery | Kind | Route | Status |
|---|---|---|---|---|
| 1 | "Refresh tokens are accepted after logout — a replay window exists." | Reproduced defect evidence | `bug-report` at `.swarm/sources/bugs/refresh-token-replay.md` (diagnosis-only; fix promotes onward to a `task_kind: fix`) | `promoted` |
| 2 | "The refresh endpoint trusts the client clock for token expiry." | Reusable project fact, high-consequence | `finding.md` — passes `pending → validated → promoted` (re-run proof + second reviewer); full provenance; INDEX `Load when`: "Touching auth token expiry or refresh endpoints" | `promoted` |
| 3 | "Client-clock-trust is the same shape we saw in the session-cookie work." | Repeated cross-task pattern | Held: only one corroborating finding (#2) exists today | `blocked` — reason "needs a second corroborating finding before a pattern" |
| 4 | "The test fixture seeds three users; only one is used." | Purely local execution detail | Keep in `task.md` | `rejected` — reason "execution-local" |

No item is left `pending`; #4 is recorded as a `rejected` disposition, not omitted; #3 is `blocked` rather than promoted to a pattern on a single witness; #2 went through `validated` because it is high-consequence. The resolved queue is then written to a `promotions/` ledger entry. The task may now close.
