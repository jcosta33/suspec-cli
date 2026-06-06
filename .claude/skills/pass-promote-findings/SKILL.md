---
type: pass-guide
name: pass-promote-findings
pass: promote
description: >-
  Run the `promote` pass — the feedback loop closing a task by routing each discovery to a durable
  target, indexing it, and resolving the promotion queue. ALWAYS apply when a task names `promote`,
  finishes after surfacing durable facts, decisions, patterns, terminology, or workflow rules, or
  resolves a promotion queue before closure — even if a discovery seems too small. Do not close a
  task with any item still `pending`, write a finding without full provenance, or promote a single
  finding straight to a pattern. Skip for authoring/amending a spec, verdicts (the `review` pass),
  or implementation.
---

# Pass guide: promote

> **Scope of this file.** A *pass guide*: a procedural how-to for running the `promote` pass well. SOFT control — it conditions *how* an agent runs the pass; it constrains nothing and defines no Swarm semantics. The seven-value promotion-status enum, discovery-to-target routing, mandatory provenance fields, authority floor, loss budget, validation/rollback, and ledger shape are canonical Swarm rules; this guide *applies* them and restates their load-bearing meaning inline so the pass runs from this file alone — never redefining them.

## Purpose

`promote` is the last of nine passes (`author → lint → improve → lower → decompose → implement → verify → review → promote`). It is the durable feedback loop: a discovery does **not** become memory by being written down — it becomes memory by being **promoted**. This pass takes each discovery a task surfaced, routes it to a durable target, indexes it, records its disposition, and resolves the promotion queue so the task may close.

The failure mode it prevents: chat transcripts and inline prose are not memory — they are unindexed, unprovenanced, unfalsifiable. The procedure earns durability through a *recorded* promotion into a two-tier, provenance-anchored model — a compact Tier-1 map (`memory/INDEX.md` + `memory/glossary.md`) over an immutable Tier-2 evidence store (`finding.md` / `adr.md` / `audit.md` / `bug-report.md` / `memory/patterns/*.md`).

Like every Swarm pass, `promote` has **no runtime**: a contract a human, agent, or future tool performs by hand against the files Swarm ships. One borrowed discipline applies throughout, restated rather than linked: at the `task.md → finding.md` boundary, distillation MAY drop the step-by-step execution log but MUST preserve the actionable claim, its applicability envelope, and its evidence — silent loss of any of the three is not compression, it changes what becomes memory (the loss-budget discipline).

## Consumes

- The task's **discoveries** — every durable fact, decision, pattern, terminology clarification, or workflow rule the task surfaced (from `task.md`, the `*.swarm.trace.md` claims, the `review.md` verdict record).
- The **promotion queue** — the resolved-or-pending list of promotion items raised during the task.
- The current Tier-1 map: `memory/INDEX.md` and `memory/glossary.md` — to check existing entries, prior findings to corroborate against, and terms already bound.
- The relevant `origin_obligations` (`AC-`/`C-`/`I-`/`IF-…`) and `origin_traces` (`*.swarm.trace.md`) that produced each discovery's evidence.

## Produces

- Durable writes: source artifacts (findings, ADRs, audits, bug-reports — each a `type:`-tagged document kept in your repo's docs/sources location) and memory (patterns, glossary), routed per the table in rule 2.
- An updated `memory/INDEX.md`: a new `Load when` row for every `promoted` finding, a retraction row for every `rolled-back` finding.
- A **fully-resolved promotion queue**: every item carries one of the seven canonical statuses, and **no item is `pending`**.
- A **`promotions/` ledger entry** recording the resolved queue as compact, immutable history (rule 11).

## Core rules

### 1. Collect the queue — no silent drops

Enumerate every discovery the task surfaced into the promotion queue. A discovery left out is a silent drop; even a purely local execution detail is queued and resolved (`rejected`, reason `execution-local`), never omitted. **Rationale:** the mandatory-before-close gate makes memory a *promotion system* rather than an accretion of chat — and a gate with an off-ramp ("too small to bother") is no gate. Recording the rejection keeps the queue falsifiable: a reviewer sees *that* a detail was judged non-durable, not just that it is absent.

### 2. Route each item by kind

The kinds are mutually exclusive by intent. A discovery with two faces (e.g. both a durable decision *and* a reusable pattern) is promoted to each applicable target, each landing as its **own** queue item.

| Discovery | Promote to |
|---|---|
| New intended behaviour (a real obligation to build against) | `spec.swarm.md` (new/amended `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`), or an ADR when gated on an undecided architectural/product choice |
| Durable architectural/product decision (choice + alternatives + trade-offs) | An ADR (`type: adr`), kept with your repo's ADRs |
| Present-state risk or debt (what *is*, observed, not yet a chosen change) | An audit (`type: audit`) — observation-only, never prescriptive |
| Reproduced defect evidence (root cause + expected vs actual) | A bug-report (`type: bug-report`) — diagnosis-only; the fix promotes onward to a `task_kind: fix` task |
| Reusable project fact (durable evidenced claim) | A finding (`type: finding`), indexed in the memory index with `Load when` + full provenance |
| Repeated cross-task pattern (recurring solution shape across >1 task) | `memory/patterns/*.md` |
| Terminology clarification (ambiguous/drifted term) | `memory/glossary.md` (resolves `SOL-P006` undefined-term / `SOL-P057` terminology-drift at the source) |
| Universal workflow rule (a procedure for every future task) | A **pass-guide edit (the procedure) PLUS at most a one-line `AGENTS.md` pointer** — never inline procedure |
| Purely local execution detail (relevant only to this run) | Keep in the task only (`task.md`); disposition `rejected`, reason "execution-local" |

**Rationale:** the *kind* fixes a discovery's single durable home, keeping memory sorted by epistemic stance — observations in audits, decisions in ADRs, intended behaviour in the spec. Mis-routing (e.g. filing an observation as an obligation) launders a present-state fact into intent without the authoring act rule 4 demands.

### 3. Check the authority floor before writing

`memory` is the lowest domain on the source-authority order. If a promotion would *weaken or narrow* an existing obligation, STOP — do not write it as memory. It is a `SOL-M004` authority-conflict; route it to amendment/review. **Rationale:** a fact can never quietly relax an obligation it was discovered against. A promoted finding may **inform** an obligation, never **narrow** one *as memory*. Re-stating the finding as a spec obligation is a different act — a **domain-promotion** — and is allowed: the obligation acquires its *new container's* authority (intent acquiring rank), not the `memory` floor being breached.

### 4. Write the durable target, applying the loss budget and full provenance

Create the routed artifact. When the source is a `task.md`, distil at the boundary: drop the execution log, preserve the actionable claim, applicability, and evidence (the loss-budget discipline, restated above). Promoting a discovery into intent (a spec obligation) is an **authoring act** that re-states it with its own ID, modality, and `VERIFY BY` — never a silent re-label of an observation as a requirement.

For a **finding**, fill the full provenance record — `claim`, `evidence`, `origin_obligations[]`, `origin_traces[]`, `pass`+`profile`, `reviewer_or_tool`, `timestamp`, `content_hash`, `confidence`, and the `applies-when` / `does-not-apply-when` scope envelope. The field-by-field meaning is in `references/promotion-mechanics.md`. **Rationale:** provenance makes a finding *falsifiable* and *staleness-checkable*. A finding without it is chat, not memory — do not let it reach `accepted`/`promoted`.

### 5. Apply the validation gate where required

For a **high-consequence** promotion, or any `pending` finding from an **externally-authored / untrusted source** (an agent file or rule supplied outside the project is a poisoning vector — its claims cannot be trusted on authorship alone), advance through `pending → validated → promoted`. `validated` requires **independent corroboration**: a second finding, a re-run proof, or a reviewer who is *not* the promoting agent (generalizing the two-finding pattern rule). **Rationale:** authorization is not validation — owner sign-off establishes *who* may write, never *whether the fact holds*; the gap is poisoning at ingestion, drift at consolidation, conflict at retrieval. `validated` is **non-terminal**: it does not satisfy the close gate alone — carry it to `promoted` (or another disposition) before closing.

### 6. Index every promoted finding with a usable `Load when`

Add a row to `memory/INDEX.md` whose `Load when` names the trigger telling a future agent the entry is relevant. The INDEX **links into** Tier-2; it MUST NOT duplicate bodies. **Rationale:** the INDEX is the always-read recall map; one that lists every entry without saying *when each matters* drowns the agent in noise against the density cap and loss budget. If you cannot write a `Load when`, the entry does not belong — reconsider whether the discovery is durable.

```text
## Durable findings

| Finding                         | Status   | Load when                                         |
| ------------------------------- | -------- | ------------------------------------------------- |
| finding-refresh-token-replay.md | promoted | Touching auth token rotation or refresh endpoints |
```

### 7. Promote a pattern only on a second corroborating finding

Do not promote a single finding **directly** to a `memory/patterns/*.md` pattern. Promote to a `finding.md` first, and to a pattern only once a **second corroborating finding** exists; the pattern MUST cite the findings it generalizes, and is appended-on-supersession (do not overwrite). **Rationale:** a pattern distils *several* findings — a "pattern" with one witness is a finding wearing a hat, and elevating it over-generalizes from a single data point. For a **glossary** clarification, bind exactly one term to one definition; split a contested term into distinct terms, never overload (this closes `SOL-P006` / `SOL-P057` at the source).

### 8. For a universal workflow rule, apply the G9 tie-break

Put the *procedure* in the owning pass guide; add at most **one line** to `AGENTS.md` — the pointer plus its load-when, nothing procedural. **Rationale:** the bootloader (`AGENTS.md`) holds persistent *facts*, not steps, under a tight line budget; inlining a procedure pushes load-bearing content into a place always loaded yet read shallowly. Example: promoting "always run the migration dry-run before applying" adds the dry-run procedure to the `implement` guide; `AGENTS.md` gains only `- Before applying a migration, load the implement pass guide (migration section).`

### 9. Handle rollback when withdrawing a fact

If a previously `promoted` finding is shown poisoned, `CONTRADICTED`, or `STALE`, set it `rolled-back`: record a **retraction entry in `memory/INDEX.md`** — never a silent delete, so the chain stays auditable under append-only immutability — and **re-open any obligation it had narrowed**. **Rationale:** distinguish from supersession. Supersession *replaces* a fact with a better one; rollback *withdraws* a fact that should never have been promoted. Different acts with different audit meanings; collapsing them erases why the store changed.

### 10. Resolve every item and check the close gate

Disposition every queue item to one of the **seven** canonical statuses. A task MUST NOT close while any item is `pending`. Each of `deferred` / `rejected` / `blocked` carries a **reason**.

| Promotion status | Meaning | Terminal for this task? |
|---|---|---|
| `pending` | Raised, not yet dispositioned | No — the close gate forbids it |
| `promoted` | Written to its durable target and indexed | Yes |
| `deferred` | Recorded for a future task **with reason** | Yes |
| `rejected` | Judged non-durable **with reason** | Yes |
| `blocked` | Cannot promote yet (e.g. needs an ADR) **with reason** | Yes |
| `validated` | High-consequence intermediate (`pending → validated → promoted`); independent corroboration | No — non-terminal |
| `rolled-back` | A promoted finding later withdrawn, recorded as a retraction | Post-promotion disposition |

**Rationale:** the seven values are a fixed vocabulary; inventing an eighth (`maybe`, `partial`) or treating `validated` as terminal reopens the close gate the pass exists to enforce. The per-status gate behaviour (why `validated` and `rolled-back` are special) is in `references/promotion-mechanics.md`.

### 11. Record the resolved queue in the `promotions/` ledger

Once the queue is fully resolved, write a promotions-history entry (a compact, committed log your project keeps — created on first promote, never pre-stubbed): the durable target each promoted discovery landed at, and the disposition of every queue item. The entry is **immutable and append-only** — a correction is a *new* entry referencing the one it amends, never an in-place edit. **Rationale:** memory preserves *durable facts*; this history preserves *compact reconciled record* — the audit trail letting a project discard verbose throwaway execution packets without losing the backward trace from today's code to the discoveries it produced. Because a task cannot close with any `pending` item, the entry records a fully-resolved queue *by construction*. It introduces no new evidence type — a projection of the resolved queue this pass already produced.

## What does not belong

- **Swarm semantics.** Modality, the source-authority order, verification verdicts, the routing/status definitions, and the lint codes are fixed by SOL and the reference layer. This guide *applies*, never redefines them. If you are explaining *what* `SOL-M004` means rather than *how* to act on it, that text belongs in the reference.
- **The staleness comparator and any automation.** Swarm ships the *fields* that make staleness computable (`content_hash`, `origin_traces`); it does **not** ship the comparator. Recomputing the hash and flipping `accepted → stale` is a harness/CLI concern, manual today. Embedding retrieval, automatic eviction, validation *scoring*, and memory analytics are deferred post-v0.1 — `validated` today is satisfied by human / second-finding / re-run corroboration, not a scored gate.
- **Spec authoring, verdict rendering, implementation.** Amending a spec, deciding the merge gate, or writing code are other passes; promotion only *routes* discoveries to their inputs.

## Anti-patterns

- ❌ Closing a task with an item still `pending` → resolve it to one of the seven statuses first; the close gate is normative.
- ❌ "It passed validation, so it's done" while the item sits at `validated` → `validated` is non-terminal; carry it to `promoted` or another disposition before closing.
- ❌ A `promoted` finding with no `memory/INDEX.md` row, no `Load when`, or partial provenance → it is chat, not memory; complete the record or do not promote it.
- ❌ An INDEX entry whose `Load when` is blank or "always" → dead weight; if it cannot name *when it matters*, it is not durable.
- ❌ Promoting a one-witness observation straight to `memory/patterns/*.md` → promote a `finding.md` first; a pattern needs a second corroborating finding it cites.
- ❌ Filing a present-state observation as a spec obligation → that re-labels observation as intent; route observations to an audit, re-state intent only as a deliberate authoring act with its own ID, modality, and `VERIFY BY`.
- ❌ Inlining a workflow-rule procedure into `AGENTS.md` → procedure goes in the pass guide; `AGENTS.md` gets one pointer line (G9).
- ❌ A promotion that quietly relaxes an obligation "because the finding shows it's not needed" → a `SOL-M004` floor breach; route to amendment, never write it as memory.
- ❌ Deleting a withdrawn finding → record a `rolled-back` retraction in the INDEX so the chain stays auditable.
- ❌ Dropping the actionable claim, its applicability, or its evidence at the `task.md → finding.md` boundary "to keep it short" → silent loss, not compression; only the execution log MAY be dropped.

## Self-review

Not complete until every box is checked, on the record:

- [ ] Is every discovery the task surfaced represented in the queue (no silent drops, including execution-local details dispositioned `rejected`)?
- [ ] Is every item dispositioned, and is **nothing** still `pending`?
- [ ] Does every `promoted` finding have a Tier-2 body, an INDEX `Load when`, and full provenance?
- [ ] Did any item route to two faces (decision + pattern, etc.) and land as **separate** queue items?
- [ ] Did a high-consequence or externally-authored promotion pass `pending → validated → promoted` rather than skipping `validated`?
- [ ] Was a pattern created only with ≥2 corroborating findings it cites?
- [ ] Did any promotion weaken an obligation as memory (a `SOL-M004` floor breach)? If so, was it rejected and routed to amendment, not written?
- [ ] For a workflow-rule promotion, did the procedure go to a pass guide and only a one-line pointer to `AGENTS.md`?
- [ ] Was any withdrawal recorded as a `rolled-back` retraction (with re-opened obligations), not a silent delete?
- [ ] Was the resolved queue written to a `promotions/` ledger entry (append-only)?
- [ ] Did this guide stay procedural — applying, not redefining, the routing, status, provenance, and ledger rules?

## Bundled resources

- `references/promotion-mechanics.md` — the field-by-field provenance record, the per-status behaviour at the close gate, the finding-`status` vs promotion-`status` distinction, the validation/rollback mechanics, and a worked promotion-queue example.
