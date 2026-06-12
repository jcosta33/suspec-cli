---
type: spec
id: SPEC-promote
title: swarm promote — create a finding and index it into recall (src/modules/Commands)
status: draft
owner: José Costa
sources: [self]
created: 2026-06-08
format: sol
---

# Spec: swarm promote — create a finding and index it into recall

## Intent

`swarm promote` is the operator command that closes the feedback loop at the end of a finished task: it takes
a durable discovery and makes it **recallable**. v1 is the **create-a-finding + index** mechanism — given the
provenance of one discovery (its claim, evidence, applies-when / does-not-apply-when, origin, confidence), it
writes a `finding.md` (from `templates/finding.md`) into `findings/`, and adds one
`Load when` row to `.agents/memory/INDEX.md` that links the new file. This is the producer side of the
two-tier memory model: the finding is the Tier-2 evidence body, the INDEX row is the Tier-1 map entry. The
command writes a **source-doc** (a recorded fact), not intent — it never authors obligations.

## Non-goals

- Not the full `promote` step. The step also routes other discovery kinds (ADR / audit / bug-report /
  pattern / glossary / step-guide-pointer) and **resolves a promotion queue** to a terminal status before a
  task may close; `swarm promote` v1 owns only the finding-create-and-index target.
- Not pattern formation: a single finding is never promoted straight to a `memory/patterns/*.md` (that needs a
  second corroborating finding) — out of v1 scope.
- Not the staleness comparator: v1 records `content_hash`, it does not recompute it or flip a finding to
  `stale`/`superseded` (a future tool's job — Swarm ships the field, not the comparator).
- Not authoring or amending a spec/ADR — re-stating a finding as an obligation is a later `author` pass, not
  this command.

## Context

A `Commands`-layer use case in `src/modules/Commands` (ADR-0001: one tool, code in `/src`, no monorepo). It
sits on the same dispatch path as every other `swarm <command>` (spec 001 IF-001) and is the realization of
that surface's `promote` command. The memory model it writes into — two tiers, provenance-anchored, the
seven-value promotion-status enum, the `Load when` discipline — is the Swarm framework's `promote` step, and
the `finding.md` shape is the framework's finding template (`templates/finding.md`); this spec
contracts the command that produces those artifacts, it does not redefine them. The target homes are fixed by
the adoption layout (`AGENTS.md`): findings under `findings/`, the recall map at
`.agents/memory/INDEX.md`. Errors use the repo's `Result` + `AppError` (`src/infra/errors`).

## Interfaces

INTERFACE IF-001:
`promote_finding` RETURNS `Result<PromotedFinding, PromoteFailure>`
ACCEPTS:
  - `discovery: DiscoveryInput` (claim, evidence, applies_when, does_not_apply_when, origin_obligations, pass, profile, reviewer_or_tool, confidence)
  - `memory_root: string` (the `.agents/memory/` adoption surface)
ERRORS:
  - PromoteFailure(reason=missing-applies-when)
  - PromoteFailure(reason=index-row-conflict)
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#promote_finding_contract

## Obligations

REQ AC-001:
WHEN `swarm promote` runs against a discovery input
THE command MUST write one `finding.md` derived from `templates/finding.md` into `findings/`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#writes_finding_file
DEPENDS ON IF-001
WRITES findings/**
RISK high

REQ AC-002:
THE command MUST populate the finding's full provenance record — `claim`, `evidence`, `applies_when`, `does_not_apply_when`, `origin_obligations`, `pass`, `profile`, `reviewer_or_tool`, `content_hash`, `confidence`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#finding_carries_full_provenance
DEPENDS ON AC-001
RISK high

REQ AC-003:
WHEN the discovery input names no `applies_when` scope
THE command MUST refuse to write the finding
AND THE command MUST report the missing-scope reason
BECAUSE an unscoped finding cannot tell a future agent when it matters, so it is dead weight against the recall budget and MUST NOT be promoted
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#refuses_finding_without_applies_when
DEPENDS ON IF-001
RISK high

REQ AC-004:
WHEN the finding is written
THE command MUST add exactly one `Load when` row to `.agents/memory/INDEX.md` that links the new finding file
AND THE command MUST set that row's `Load when` condition to the finding's `applies_when` scope
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#index_row_added_with_load_when
DEPENDS ON AC-001
WRITES .agents/memory/INDEX.md
RISK high

REQ AC-005:
THE command MUST record the finding's `content_hash` as a documented placeholder marked not-yet-computed
BECAUSE `content_hash` is tool-emitted and this command does not yet compute a digest; a by-hand placeholder is honest and stays untrusted until a tool recomputes it, whereas a fabricated digest would falsely assert a verified hash (ADR-0055)
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#content_hash_is_documented_placeholder
DEPENDS ON AC-002
RISK medium

REQ AC-006:
THE command SHOULD set the written finding's `status` frontmatter to `candidate`
BECAUSE v1 records a fresh, not-yet-corroborated fact; advancement to `accepted`/`promoted` requires the corroboration this command does not perform, so claiming a higher status would overstate the finding's standing
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#status_defaults_to_candidate
DEPENDS ON AC-001
RISK low

## Constraints

CONSTRAINT C-001:
THE command MUST NOT write any `REQ`, `CONSTRAINT`, `INVARIANT`, or `INTERFACE` block into the finding
BECAUSE a finding is a source-doc that records a fact; obligations are authored only when a finding is later promoted into a spec/ADR by the `author` pass, so emitting one here would smuggle intent into the evidence store
VERIFY BY static:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#finding_has_no_obligation_blocks

CONSTRAINT C-002:
THE command MUST NOT modify, reorder, or remove any existing row in `.agents/memory/INDEX.md`
BECAUSE the INDEX is an append-only recall map; editing a prior row would silently rewrite or drop a peer finding's load-when trigger
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#index_append_only

CONSTRAINT C-003:
THE command MUST NOT overwrite an existing `finding.md` in `findings/`
BECAUSE a promoted finding is immutable evidence; clobbering one would destroy a recorded fact and its provenance
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#never_overwrites_existing_finding

## Invariants

INVARIANT I-001:
the finding's `applies_when` scope and its `INDEX.md` `Load when` condition MUST state the same scope
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#applies_when_matches_index_load_when

INVARIANT I-002:
every finding the command writes MUST be reachable from exactly one `INDEX.md` row, and every row it adds MUST resolve to a finding file that exists
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#every_finding_indexed_once_and_resolvable

## Questions

QUESTION Q-001 [non-blocking]:
What derives the finding's filename slug — the claim, an explicit input, or a content hash — and how is a collision with an existing slug resolved (suffix, refuse, or prompt)?
AFFECTS AC-001

QUESTION Q-002 [non-blocking]:
Does v1 also append the promoted item to a `promotions/` ledger entry, or is the ledger (and the full queue-resolution close gate) deferred to the queue-resolving slice of the `promote` step?
AFFECTS AC-004

## Verification coverage

These are proof **contracts**: the artifacts do not exist yet, so every obligation here is `UNVERIFIED` until
`implement` builds the bound proof. Each binding resolves through `AGENTS.md > Commands`
(`cmdTest` = `pnpm test:run`); the adapter is `cmdTest` because every obligation here is a filesystem/behaviour
fact a test can falsify, except C-001 (a structural absence check, bound as a `static` proof on the same suite).

| ID     | VERIFY BY                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#promote_finding_contract           |
| AC-001 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#writes_finding_file                    |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#finding_carries_full_provenance        |
| AC-003 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#refuses_finding_without_applies_when   |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#index_row_added_with_load_when         |
| AC-005 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#content_hash_is_documented_placeholder |
| AC-006 | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#status_defaults_to_candidate           |
| C-001  | static:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#finding_has_no_obligation_blocks     |
| C-002  | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#index_append_only                      |
| C-003  | test:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#never_overwrites_existing_finding      |
| I-001  | property:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#applies_when_matches_index_load_when |
| I-002  | property:cmdTest:src/modules/Commands/__tests__/promote.spec.ts#every_finding_indexed_once_and_resolvable |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The v1 contract: write one provenance-complete `finding.md` from the template, refuse an unscoped finding,
  append exactly one `Load when` INDEX row whose scope matches the finding's `applies_when`, keep the finding
  obligation-free, treat the INDEX as append-only and findings as immutable, and record `content_hash` as an
  honest placeholder (ADR-0055).
- The two-tier producer relationship: a finding (Tier-2 body) is always reachable from exactly one INDEX row
  (Tier-1 map), and the scope envelope is single-sourced across the two (I-001/I-002).

### Dropped

- The full `promote` step's queue-resolution close gate and the seven-value promotion-status enum
  (`pending`/`promoted`/`deferred`/`rejected`/`blocked`/`validated`/`rolled-back`) — v1 is the
  finding-create-and-index mechanism, not the queue resolver; the queue slice and its `promotions/` ledger
  remain a later increment (Q-002).
- The other discovery-routing targets (ADR / audit / bug-report / pattern / glossary / step-guide-pointer)
  — each is a different command/pass concern, not this one.
- The `validated` corroboration path and the untrusted-source boundary — v1 writes a `candidate` finding
  (AC-006); advancing it is out of scope.

### Still uncertain

- The finding filename/slug derivation and collision policy (Q-001).
- Whether the `promotions/` ledger append belongs to v1 or to the queue-resolving slice (Q-002).
- The exact `content_hash` placeholder token and the future tool that recomputes it (it shares the staleness
  comparator that Swarm defers across the toolchain).
