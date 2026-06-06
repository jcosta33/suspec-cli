# The `promote` pass

This file is the contract for the `promote` pass: the memory model, the promotion protocol, the seven-value promotion-status enum, the discovery-to-target routing table, and validation & rollback. It is self-standing — the authority for this pass lives here.

`promote` is the last of the **nine passes** of the Swarm compiler pipeline (`author -> lint -> improve -> lower -> decompose -> implement -> verify -> review -> promote`).

Like every Swarm pass, `promote` has **no runtime**: it is a contract a human, an agent following a pass guide, or a future tool performs. The kernel ships the *files and the discipline* a retrieval/promotion tool would build against — not a retrieval engine, validation scorer, or eviction manager. Nothing here is shipped code.

## What the pass does

A discovery made during a task does **not** become memory by being written down; it becomes memory by being **promoted**. The `promote` pass is the durable feedback loop: it takes each discovery a task surfaced, routes it to a durable target, indexes it, and records its disposition — so a future task can recall it without bloating the always-loaded bootloader.

The model is **two-tier and provenance-anchored**. Rationale: chat transcripts and inline prose are not memory — they are unindexed, unprovenanced, and unfalsifiable. Memory MUST be a *promotion system* (a fact earns durability through a recorded promotion) backed by an *immutable evidence store*, with a compact index over it.

| Aspect | Value |
|---|---|
| Phase | **PROMOTE** — the seventh and final phase |
| Input | the task's discoveries + the resolved-or-pending promotion queue |
| Output | durable writes to `.swarm/memory/` and `.swarm/sources/` (plus the `AGENTS.md` pointer case) and a fully-resolved promotion queue |
| Close gate | a task MUST NOT close while any promotion item is `pending` |
| Ships a stdlib pass guide in v0.1? | **Yes** — `promote` ships a dedicated pass guide (`../skills/pass-promote-findings/SKILL.md`), as do `lint`, `decompose`, and `review[profile: skeptic]`; `implement` is served by the nine per-`task_kind` guides, `author` by the six author guides, and `verify` by the `empirical-proof` fragment; `improve` and `lower` ship none |

## The two-tier memory model

`promote` writes into a model with a deliberate split between a cheap map and an immutable store.

### Tier-1 — the compact map (what an agent reads first)

| Artifact | Role | Discipline |
|---|---|---|
| `memory/INDEX.md` | A **map of links, not explanations**; links into Tier-2, never duplicates bodies | Every entry MUST carry a **`Load when`** condition (the trigger telling a future agent the entry is relevant). The **load-when discipline**: an entry that cannot name *when it matters* MUST be removed — it is dead weight against the loss budget and the always-loaded density cap, since attention degrades for information buried in a long context. |
| `memory/glossary.md` | One word, one meaning (controlled vocabulary: each term resolves to a single sense so agents never disambiguate at read time) | Each entry binds exactly one term to one definition; a contested term is **split**, never overloaded. An in-file `TERM` in a spec takes precedence over the glossary for that spec. |

### Tier-2 — the immutable evidence store (the territory)

| Artifact | Role in memory | Mutability |
|---|---|---|
| `finding.md` | One durable project fact + its evidence | Immutable once `accepted`/`promoted`; status may advance, body does not silently change |
| `adr.md` | Architectural/product decision + rationale | Immutable in the Nygard sense — an accepted ADR is a historical record; amend only by superseding ADR |
| `audit.md` | Present-state risk/debt observation | Immutable record of an observation at a point in time |
| `bug-report.md` | Reproducible-defect diagnosis | Immutable record of a reproduction |
| `memory/patterns/*.md` | Recurring knowledge spanning **multiple** findings | Append-on-supersession |

A single finding MUST NOT be promoted directly to a pattern: promote it to a `finding.md` first, and to a `memory/patterns/*.md` pattern only once a **second corroborating finding** exists. A pattern MUST cite the findings it generalizes.

## Provenance — mandatory on every promoted finding

Every finding that reaches `accepted` or `promoted` MUST carry the full provenance record; provenance is what makes a finding *falsifiable* and *staleness-checkable*. A finding without it is chat, not memory.

| Field | Meaning |
|---|---|
| `claim` | The one durable fact, as a single proposition |
| `evidence` | The file/command/output/source grounding the claim |
| `origin_obligations[]` | The obligation IDs (`AC-/C-/I-…`) the finding was discovered against |
| `origin_traces[]` | The `*.swarm.trace.md` entries that produced the evidence |
| `pass+profile` | The pass + heuristic profile it was found under (e.g. `review[profile: skeptic]`) |
| `reviewer_or_tool` | The human reviewer or tool/adapter that confirmed it |
| `timestamp` | When it was promoted |
| `content_hash` | Hash of the cited source/surfaces at promotion time (drives staleness) |
| `confidence` | `high` \| `medium` \| `low` |
| `applies-when` / `does-not-apply-when` | The scope envelope; mirrors the INDEX `Load when` |

## The promotion-status enum — exactly seven values

Every promotion item raised during a task MUST resolve to one of these **seven** statuses before the task closes:

| Promotion status | Meaning | Terminal for this task? |
|---|---|---|
| `pending` | Raised, not yet dispositioned | No — the close gate forbids it |
| `promoted` | Written to its durable target and indexed | Yes |
| `deferred` | Recorded for a future task **with reason** | Yes |
| `rejected` | Judged non-durable **with reason** | Yes |
| `blocked` | Cannot promote yet (e.g. needs an ADR) **with reason** | Yes |
| `validated` | High-consequence intermediate (`pending -> validated -> promoted`); requires independent corroboration | No — non-terminal, does not satisfy the close gate alone |
| `rolled-back` | A promoted finding later withdrawn (poisoned / `CONTRADICTED` / `STALE`), recorded as a retraction | Post-promotion disposition |

**Close gate (normative).** A task MUST NOT close while any promotion item is `pending`. A `promoted` finding MUST appear in `memory/INDEX.md` with a `Load when` and carry full provenance.

**Authority floor (normative).** A promotion that would *weaken* an existing obligation is forbidden at any target — it is a `SOL-M004` authority-conflict routed to amendment, because `memory` is the floor domain on the authority axis. Re-stating a finding as a spec obligation via this pass is a **domain-promotion**: the obligation acquires its *new container's* authority — that is intent acquiring rank, not the `memory` floor being breached.

## Discovery-to-promotion-target routing

The kinds are mutually exclusive by intent; a discovery with two faces (e.g. both a durable decision *and* a reusable pattern) is promoted to each applicable target and each lands as its own queue item.

| Discovery | Promote to |
|---|---|
| New intended behaviour (a real obligation to build against) | `spec.swarm.md` (new/amended `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`), or an ADR when gated on an undecided architectural/product choice |
| Durable architectural/product decision (choice + alternatives + trade-offs) | An ADR (`.swarm/sources/adrs/<nnnn>-<slug>.md`) |
| Present-state risk or debt (what *is*, observed, not yet a chosen change) | An audit (`.swarm/sources/audits/<slug>.md`) — observation-only, never prescriptive |
| Reproduced defect evidence (root cause + expected vs actual) | A bug-report (`.swarm/sources/bugs/<slug>.md`) — diagnosis-only; the fix promotes onward to a `task_kind: fix` task |
| Reusable project fact (durable evidenced claim) | A finding (`.swarm/sources/findings/<slug>.md`), indexed in `memory/INDEX.md` with `Load when` + full provenance |
| Repeated cross-task pattern (recurring solution shape across >1 task) | `memory/patterns/*.md` |
| Terminology clarification (ambiguous/drifted term) | `memory/glossary.md` (resolves `SOL-P006` undefined-term / `SOL-P057` terminology-drift at the source) |
| Universal workflow rule (a procedure for every future task) | A **pass-guide edit (the procedure) PLUS at most a one-line `AGENTS.md` pointer** — never inline procedure in `AGENTS.md` (the G9 tie-break) |
| Purely local execution detail (relevant only to this run) | Keep in the task only (`task.md`); dispositioned **`rejected`** with reason "execution-local" |

Two consequences hold across every row. First, weakening an obligation is forbidden at any target (the `SOL-M004` floor above). Second, **"keep in the task only" is a real disposition, not an omission**: the item is still recorded in the queue and resolved (`rejected`, with reason), so the mandatory-before-close rule admits no silent drops.

### G9 — "universal workflow rule" promotions never inline procedure

A universal-workflow-rule promotion collides with the ≤200-line bootloader cap and the fact/procedure split: only persistent **facts** belong in `AGENTS.md`; **procedures** belong in pass guides. Swarm resolves it normatively:

| Where it goes | What goes there |
|---|---|
| Pass guide (a sibling skill / pass-guide file under `kernel/.agents/`) | The actual procedure / steps |
| `AGENTS.md` | One line: the pointer + its load-when, nothing procedural |

> Example — promoting "always run the migration dry-run before applying": the dry-run procedure is added to the `implement` pass guide; `AGENTS.md` gains only `- Before applying a migration, load the implement pass guide (migration section).`

## Validation and rollback (memory governance)

Authorization is not validation. A memory write MUST pass consistency verification before consolidation, not merely owner approval — owner sign-off establishes *who* may write, never *whether the fact holds*. Three failure points motivate the rule: poisoning at ingestion (a bad fact entering the store), semantic drift at consolidation (a fact's meaning bending as it merges with others), and conflict/hallucination at retrieval (a recalled fact contradicting the store or inventing detail). The v0.1 forward-only `pending -> promoted` model addresses none of these, so two additions close the gap:

- **`validated`.** A high-consequence promotion MUST pass `pending -> validated -> promoted`, where `validated` requires **independent corroboration** — a second finding, a re-run proof, or a reviewer who is not the promoting agent (generalizing the two-finding rule for patterns). A `pending` finding from an externally-authored source MUST NOT skip `validated`: this is the untrusted-source boundary — an agent file, rules file, or `AGENTS.md` supplied outside the project is a known prompt-injection / memory-poisoning vector, so its claims cannot be trusted on authorship alone.
- **`rolled-back`.** A promoted finding later shown poisoned, `CONTRADICTED`, or `STALE` (the verdict decorators the `review` pass attaches) MUST be withdrawable, recording a **retraction entry in `memory/INDEX.md`** — not a silent delete, so the chain stays auditable (immutable-record discipline, the Nygard sense) — and re-opening any obligation it had narrowed. Supersession replaces a fact with a better one; rollback withdraws a fact that should never have been promoted.

## Staleness

A finding's `status` enum is `candidate | accepted | promoted | rejected | stale | superseded`. A finding becomes **`stale`** when its `content_hash` no longer matches the cited source/surfaces — the same drift signal behind the `STALE` verdict decorator and the spec↔code reconcile. A `stale` finding MUST NOT be relied on as authority; it routes to re-verification or supersession. A `superseded` finding records its replacement in the INDEX stale/superseded table. The kernel ships the **fields** that make staleness computable (`content_hash`, `origin_traces`); it does **not** ship the comparator — recomputing the hash and flipping `accepted -> stale` is a harness/CLI concern, aspirational/manual today (every pass is a contract with no runtime, never code this repo runs).

## Deferred to post-v0.1

Each of these needs a runtime Swarm does not ship: embedding / dense-vector retrieval; LRU (or any automatic) eviction; automatic staleness hashing (fields shipped, comparator deferred); cross-session agent identity; memory dashboards / analytics. v0.1 ships the two-tier file model, the provenance fields, the promotion statuses, and the `Load when` discipline — automation builds against them later.

This file fixes the *requirements* of the pass, not its step-by-step procedure — the spec-vs-procedure boundary. The exact `validated`-corroboration procedure (what counts as a "second finding" vs a "re-run proof" vs an "independent reviewer") is bound here as a requirement; the `promote` stdlib pass guide supplies the recipe. The mechanics of the staleness comparator (recompute, compare, flip) are likewise deferred to a harness/CLI; this file ships only the fields that make them computable.

## Related

Sibling payload files under `kernel/.agents/`:

- `../passes/author.md` and `../passes/lint.md` — the start of the pipeline, where promoted intent re-enters as obligations.
- `../passes/review.md` — the pass before `promote`; its verdicts (`CONTRADICTED`, `STALE`) feed the rollback path.
- `../passes/verify.md` — produces the traces and proofs that become a finding's evidence and corroboration.
- `../passes/implement.md` — where universal-workflow-rule procedures land under the G9 tie-break.
- `../language/SOL.md` — the lint codes (`SOL-M004`, `SOL-P006`, `SOL-P057`) this pass resolves or routes to amendment.
- `../skills/pass-promote-findings/SKILL.md` — the `promote` stdlib pass guide (the step-by-step procedure this file's requirements bind).
- `../templates/spec.swarm.md` — the spec container a "new intended behaviour" promotion writes into.
- `../skills/persona-skeptic/SKILL.md` — the heuristic profile named in `review[profile: skeptic]` provenance.