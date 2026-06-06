# The `improve` pass — the ten improve operations

This file defines the `improve` pass: the closed set of ten strictly semantics-preserving improve operations, the R-IMPROVE / R-DECOMPOSE-NOT-IMPROVE rules, the worked before/after examples, and the twelve-category semantic-diff (R-SEMDIFF) that judges every edit. It is self-standing — the authority for this pass lives here.

`improve` is the third of the **nine passes** of the Swarm compiler pipeline (`author -> lint -> improve -> lower -> decompose -> implement -> verify -> review -> promote`). It is the `NORMALIZE`-phase pass that rewrites a spec to satisfy SOL and APS.

Like every Swarm pass, `improve` has **no runtime**: it is a contract a human, an agent following a pass guide, or a future tool performs. Nothing here is shipped code (Invariant 1).

## What the pass does

The `improve` pass takes a linted spec and brings it into canonical, smell-free, **semantics-preserving** form. It is defined as a **closed set of exactly ten operations** — a conformant `improve` pass MUST NOT invent operations outside this set, and "improve the spec" with no named operation is not a valid request.

| Aspect | Value |
|---|---|
| Phase | **`NORMALIZE`** (the canonicalization stage) |
| Input artifacts | `spec.swarm.md` + the `lint` report |
| Output artifacts | `spec.swarm.md` (normalized) + a spec-improvement report |
| Typical carrier profile | Architect |
| Lint layer | — (answers the lint codes the ten operations are mapped to; emits none of its own) |

Two ordering facts pin where `improve` sits:

- **`improve` runs only after `lint`.** Each improve operation is *triggered* by one or more lint codes. Running `improve` with no lint findings to answer is a **no-op**.
- **`improve` is the only pass permitted to rewrite the spec.** `lint` is non-mutating (it only emits diagnostics); `improve` is where the spec text legitimately changes — and only semantics-preservingly.

## The hard rule: improve is semantics-preserving

> **R-IMPROVE.** Every improve operation MUST be strictly semantics-preserving. An improve operation MUST NOT add, remove, weaken, strengthen, or otherwise change the **intent** of any obligation. Any change to obligation intent — a new requirement, a relaxed constraint, a different actor, a changed trigger or response — MUST route to **amendment/review**, never to `improve`.

Design rationale: `improve` is the normalization phase; intent change is a `PROMOTE`/amendment decision governed by source authority (approved spec/ADR > task > chat). Conflating the two would let a "cleanup" silently rewrite what the system builds — a direct violation of "code is reality, not intent" (Invariant 4). The spec-improvement report MUST carry a *Semantic changes* row for any edit the author is unsure preserves intent, flagged `requires approval: yes`; such edits are out of scope for `improve` and belong to amendment.

> **R-DECOMPOSE-NOT-IMPROVE.** `../passes/decompose.md` is a separate **pass**, NOT an improve operation. Splitting a spec into task-sized work packets is lowering work that changes the *artifact partition*, not the *prose*; it MUST NOT appear in the improve set. The improve operation `ATOMIZE` is distinct: it splits one bundled obligation into multiple obligations *within the same spec*, preserving the spec as the unit.

## The ten operations (normative)

The closed set, in spec order:

```text
NORMALIZE  ATOMIZE  CONCRETIZE  QUANTIFY  BIND  SCOPE  CLARIFY  DECONFLICT  COMPRESS  PROMOTE
```

Each operation is *triggered* by one or more lint codes, has a precondition (what must hold before it applies) and a postcondition (what it guarantees after). Trigger codes use the unified `SOL-<LAYER>###` namespace across the five lint layers (S/P/M/V/O); prose violations surface as `SOL-P###` codes (the full catalog is `../language/errors.md`).

| # | Operation | Trigger lint code(s) | Precondition | Postcondition |
|---|---|---|---|---|
| 1 | `NORMALIZE` | `SOL-P003`, `SOL-V###` | A clause uses an informal/lowercase modal or non-canonical phrasing/clause order. | Clause uses an approved uppercase modal in canonical clause order; no meaning changed. |
| 2 | `ATOMIZE` | `SOL-P004` | One block bundles two or more separable obligations. | Each separable obligation is its own block with its own id; bindings distributed. |
| 3 | `CONCRETIZE` | `SOL-P005` | A vague-quality word has no same-line observable criterion. | The word is replaced by observable behavior (actor + action + object). |
| 4 | `QUANTIFY` | `SOL-P005` | An unbounded quality has no measurable threshold. | The quality carries a measurable threshold or named measurable criterion. |
| 5 | `BIND` | `SOL-V001`, `SOL-V###` | An obligation lacks a `VERIFY BY` binding, source, interface, or trace reference. | The obligation carries a valid `VERIFY BY <type>:<adapter>:<artifact>` and required references (covers both proof-binding and trace-reference repair). |
| 6 | `SCOPE` | `SOL-O###` | The spec lacks declared non-goals, applicability, write surfaces, or exclusions. | Explicit non-goals / applicability / `WRITES` / exclusions are present. |
| 7 | `CLARIFY` | `SOL-P008` | Behavioral uncertainty is buried in prose, not lifted to a block. | The uncertainty is an explicit interpretation OR a `QUESTION` block. |
| 8 | `DECONFLICT` | `SOL-M002` | Two obligations (or an obligation and a higher artifact) contradict. | The contradiction is resolved per source authority, or raised to amendment. |
| 9 | `COMPRESS` | `SOL-P054`, `SOL-P055` | Prose carries non-load-bearing noise or redundancy. | Noise/redundancy removed; future agents interpret the text consistently (covers both noise removal and phrasing stabilization). |
| 10 | `PROMOTE` | the promotion protocol (`../passes/promote.md`) | A durable fact sits in task-local state. | The fact is moved to `finding.md` / `spec.swarm.md` / `adr.md` / memory with provenance. |

**`CONCRETIZE` vs `QUANTIFY`.** Operations 3 and 4 share the trigger `SOL-P005` (vague-quality word with no observable criterion). They differ only in *repair*: `CONCRETIZE` substitutes *observable behavior* (qualitative), `QUANTIFY` substitutes a *measurable threshold* (quantitative). The author selects whichever the obligation's nature requires; both exit the same lint code.

### Worked before/after

```sol
NORMALIZE
  before:  WHEN request fails, the client should retry once.
  after:   WHEN the request fails THE client SHOULD retry once BECAUSE transient failures are common.

ATOMIZE
  before:  REQ AC-010: THE API MUST validate input AND log AND retry AND alert.
  after:   REQ AC-010: THE API MUST validate input.
           REQ AC-011: THE API MUST log the validation outcome.
           REQ AC-012: THE API MUST retry once on transient failure.
           REQ AC-013: THE API MUST alert on repeated failure.

CONCRETIZE
  before:  THE response MUST be fast.
  after:   THE service MUST return the first byte within the bound named by VERIFY BY perf:cmdBenchmark:p99.

QUANTIFY
  before:  THE service MUST handle high load.
  after:   THE service MUST sustain 1000 requests per second at p99 < 200ms.

BIND
  before:  REQ AC-020: THE worker MUST persist progress every 100 rows.
  after:   REQ AC-020: THE worker MUST persist progress every 100 rows
           VERIFY BY test:cmdTest:import.progress_checkpointing.

SCOPE
  before:  (spec has no non-goals)
  after:   ## Non-goals — Swarm MUST NOT define a runtime; WRITES src/auth/** only.

CLARIFY
  before:  The session probably clears, but caching behavior is unclear.
  after:   QUESTION Q-003: [blocking] Does session clear evict the token cache? AFFECTS AC-001.

DECONFLICT
  before:  AC-001 THE client MUST send a request; AC-009 THE client MUST NOT send a request (same trigger).
  after:   AC-001 retained per source authority; AC-009 superseded with REASON, or both raised to amendment.

COMPRESS
  before:  THE system, in order to be robust and resilient, MUST very carefully validate.
  after:   THE system MUST validate the request body.

PROMOTE
  before:  (task note: "discovered the refresh endpoint rate-limits at 5/min")
  after:   finding.md: claim + evidence + origin_obligations[] + applies-when.
```

## The `improve`-op `CLARIFY` is not the CLARIFY *gate*

The `CLARIFY` improve operation (op 7 above) and the **CLARIFY gate** are distinct and MUST NOT be conflated:

- The `CLARIFY` **op** is a *local edit* in the `NORMALIZE` phase: it lifts one buried prose ambiguity (`SOL-P008`) into an explicit interpretation or a `QUESTION` block. The op *creates* the QUESTION.
- The CLARIFY **gate** is a *pipeline checkpoint* at the `NORMALIZE`→`LOWER` boundary: it refuses to advance the spec while any such question is still open and blocking. The gate *waits on* it.

One is the repair; the other is the precondition that the repair has been discharged. This file covers the op; the gate belongs to the `../passes/lower.md` pass.

## How an edit is judged legitimate: the twelve-category semantic diff

R-IMPROVE is the *rule*; the **semantic-diff classification** is the *operational test* behind it. Every spec edit reaching the `improve` or `review` pass MUST be classified into exactly one of **twelve closed categories**. The set is closed: a conformant pass MUST NOT invent a thirteenth, and an edit that fits none is itself a defect (an unanalyzable diff) that MUST be split until each part classifies.

| # | Category | What changed | Auto-approved? |
|---|---|---|---|
| 1 | added obligation | A new `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block (a new obligation id) appears. | No — amendment |
| 2 | removed obligation | An existing obligation id is deleted or renumbered out of existence. | No — amendment |
| 3 | changed trigger | The `WHEN`/state precondition of an obligation is added, removed, widened, or narrowed. | No — amendment |
| 4 | changed actor | The `THE <actor>` subject of an obligation is replaced. | No — amendment |
| 5 | changed modality | The modal (`MUST`/`MUST NOT`/`SHOULD`/`SHOULD NOT`/`MAY`) is strengthened, weakened, or negated. | No — amendment |
| 6 | changed response | The required action/object (the obligation's effect) is altered. | No — amendment |
| 7 | changed proof binding | A `VERIFY BY <type>:<adapter>:<artifact>[#selector]` is added, removed, or repointed. | No — amendment |
| 8 | changed non-goal | A `Non-goals`/applicability/`WRITES` exclusion is added, removed, or rescoped. | No — amendment |
| 9 | changed interface | An `INTERFACE` (`IF-NNN`) contract is altered. | No — amendment; breaking changes flagged |
| 10 | changed invariant | An `INVARIANT` (`I-NNN`) is added, removed, or restated with different force. | No — amendment |
| 11 | changed question status | A `QUESTION` (`Q-NNN`) changes lifecycle (raised, answered, downgraded `[blocking]`→`[non-blocking]`, or materially resolved). | No — amendment |
| 12 | pure normalization | Formatting, casing, keyword form, canonical clause order, dead-link/proof-ref completion, or redundancy compression — with **no** change to any obligation's actor, trigger, modality, response, binding, non-goal, interface, invariant, or question status. | **Yes** — the only approval-free class |

> **R-SEMDIFF.** **Pure normalization (category 12) is the only auto-approved class.** Every one of categories 1–11 is an **amendment** and MUST route to approval. The `improve` and `review` passes MUST classify each edit before the spec is promoted; an unclassified edit MUST NOT be promoted. An edit that combines a normalization with any of categories 1–11 is classified by its strongest (non-normalization) category, never as pure normalization — normalization does not "absorb" a semantic change ridden in alongside it.

The bridge this makes explicit: an `improve` operation is legitimate **iff** every edit it makes classifies as category 12. The moment an edit classifies as any of 1–11, the work has **left `improve` and entered amendment**, and the change report MUST record the category and carry `requires approval: yes`.

## Why this discipline (design rationale)

The "lint before you generate, then normalize without changing intent" shape is grounded, not stylistic. Ambiguous task descriptions measurably cut code-generation Pass@1, and contradictory ones cut it further still: the planner→coder handoff is the dominant failure surface in multi-agent code generation, and semantics-preserving perturbations of an otherwise-solved task break a large fraction of previously-passing problems. Frontier models degrade sharply on ambiguous requirements and cannot autonomously resolve them — handed a messy or ambiguous spec, even the strongest model resolves only a small fraction of tasks *even when given a tool to ask for help*. Conversely, surfacing and resolving ambiguity *before* generation — devising and discharging an explicit plan rather than generating flat over the whole spec — measurably raises downstream success, and a structured intermediate beats free-form prose for code generation. The `CLARIFY` op (lift ambiguity to a `QUESTION`) and the `DECONFLICT` op (resolve contradiction) are the concrete normalizations that turn those gains into pass-level behavior — while R-IMPROVE keeps the cleanup from silently editing intent.

## A note on author judgment

A few selections inside `improve` are deliberately left to the author rather than mechanized:

- The precise lint-code-to-operation routing where a code maps to more than one op or shares a trigger (e.g. `SOL-V###` triggers both `NORMALIZE` and `BIND`; `SOL-P005` triggers both `CONCRETIZE` and `QUANTIFY`) — the ten operations fix the triggers and the repair distinction but leave the per-finding selection to author judgment.
- The exact threshold/heuristics for the `COMPRESS` op's "non-load-bearing noise" and for when an `ATOMIZE` is required versus advisory — the operation and trigger are named, but not a mechanical bundling metric.

## Related

- `../passes/lint.md` — the pass that runs before `improve` and emits the `SOL-<LAYER>###` codes each improve operation is triggered by; `improve` runs only after it.
- `../passes/lower.md` — the next pass; home of the CLARIFY **gate** and the COVERAGE gate at the `NORMALIZE`→`LOWER` boundary (both distinct from the `CLARIFY` op), and the IR shape lowering emits (including `verify_by`, `WRITES`, and edges).
- `../passes/decompose.md` — the separate pass that splits a spec into task-sized work packets (the boundary R-DECOMPOSE-NOT-IMPROVE protects), distinct from the `ATOMIZE` improve operation.
- `../passes/review.md` — the pass that also classifies edits with the twelve-category semantic diff before promotion.
- `../passes/promote.md` — the pass that discharges amendments and source-authority decisions that `DECONFLICT` and `PROMOTE` defer to.
- `../language/SOL.md` — the Spec Obligation Language whose modals, clause order, and obligation blocks `improve` normalizes toward.
- `../language/APS.md` — the structural rules `improve` brings a spec into conformance with.
- `../language/errors.md` — the lint-code catalog the trigger codes in this file reference.
- `../templates/spec.swarm.md` — the spec artifact `improve` normalizes.
- `../skills/persona-architect/SKILL.md` — the carrier profile for this pass (`improve` is normalization, carried by the Architect; the Skeptic lists `improve` under "does not apply").
