---
type: pass-guide
name: pass-decompose-spec
pass: decompose
activates_for_task_kind: decompose
description: The `decompose` pass: partition a lowered IR obligation graph into write-disjoint packets, set each `merge_safe` by the one safe-parallelism predicate, clear COVERAGE, emit the plan + coordination record. ALWAYS apply when a task names `decompose`, partitions `*.swarm.ir.json`, projects OWNED paths, or emits `*.swarm.plan.json`/`task-orchestration.md`, typically as Lead Engineer. Never author intent, redefine `merge_safe`/overlap/subset, parallelize unscoped/shared surfaces, or claim a running scheduler. Skip `lower` (prose→IR), `implement` (a packet), verdicts/merge gate (`verify`/`review`).
---

# Pass guide: decompose

How to perform the `decompose` pass — the fifth of nine passes (`author → lint → improve → lower → decompose → implement → verify → review → promote`) and the second `LOWER`-phase pass. Where `lower` builds the IR obligation graph, `decompose` partitions it into schedulable work packets, emits the plan, and (when the run fans out) the coordination record that tracks it.

This guide is SOFT control: procedure, not meaning. The load-bearing facts — what `merge_safe`, overlap/subset, and a verdict *mean*, and the authority order (an approved spec/ADR outranks a task, which outranks chat) — are fixed at the cited references and applied here, never redefined. The structures it operates over:

- The decompose pass contract and orchestration: the `decompose` pass.
- The plan envelope and work-packet record: the `decompose` pass.
- The single safe-parallelism predicate and its surface semantics: the `decompose` pass.
- The COVERAGE gate: the `decompose` pass.
- The coordination record (`task-orchestration.md`) the run fans out into: the `decompose` pass orchestration artifact contract.
- The carrier profile: the Lead Engineer heuristic profile, [`../persona-lead-engineer/SKILL.md`](../persona-lead-engineer/SKILL.md).

## Purpose

Partition the IR obligation graph into task-sized, **write-disjoint** work packets — each carrying its assigned obligations, the constraints/invariants in force, the interfaces it touches, its write surfaces, and its verification bindings — and emit the plan: the kernel's static coordination contract answering "what units of work exist, in what order, on which surfaces, and which are safe to run together" (the `decompose` pass). The plan is versioned data a future launcher consumes, never a running scheduler (Principle 1). When the partition fans out across concurrent workers, also emit the **coordination record** that projects the partition onto workers and records their hand-offs, liveness, and merge history.

## Consumes

- The lowered IR — `*.swarm.ir.json` — including the two graphs `lower` emitted: the dependency DAG (from `DEPENDS ON`) and the write-surface conflict graph (from `WRITES`/`SURFACE`/`READS`) (see the `decompose` pass). `decompose` operates on the IR, **not** the surface spec, so packet boundaries are computed from the typed graph, never re-parsed from prose (see the `lower` pass). *Why:* re-parsing prose would let a packet boundary disagree with the lowered scope; the typed graph is the single substrate two implementations must agree on.
- The `SURFACE` declarations and their attributes (`append-only`, `integration`, `shared`) referenced by the obligations' `WRITES`/`READS` (see the `decompose` pass).

If an obligation reaches `decompose` with no `verify_by`, that is a `SOL-V001`-class defect `BIND` should have answered during `improve` (see the `improve` pass) — surface it; do not invent a binding here. *Why:* inventing one launders an unproven obligation past the gate meant to catch it.

## Produces

- One `task.md` work packet per partition unit — "the lowered work packet for one pass," the unit a single `implement` run owns (see [`../../templates/task.md`](../../templates/task.md)).
- The plan, named-as-contract `*.swarm.plan.json` (`auth-refresh.swarm.ir.json → auth-refresh.swarm.plan.json`). A SOL plan is one JSON object with **exactly four top-level keys** (see the `decompose` pass):

  | Key | Type | Cardinality | Carries |
  |---|---|---|---|
  | `meta` | object | exactly 1 | plan identity; `derived_from` (the IR path); `language` `SOL/0.1`; `version`; optional `max_parallel` (advisory launcher hint, `null` = unspecified) |
  | `packets` | array | 0..n | the schedulable work units (see the `decompose` pass) |
  | `edges` | array | 0..n | inter-packet relationships, recorded **once** here (the single-source-of-relationship-truth rule) |
  | `provenance` | object | exactly 1 | emission facts, same shape as the IR's `provenance` (see the `lower` pass) |

  Each `packets[]` record carries: `id`, `pass` (one of the nine), optional `profile`, `inputs`, `outputs`, `writes`, `reads`, `depends_on`, optional `lane`/`batch`, and `merge_safe` (see the `decompose` pass). There is **no `locks` field anywhere** — a lock group *is* a named write SURFACE, so lock analysis reduces to write-set analysis (see the `decompose` pass).

- When the run fans out, the **coordination record** `task-orchestration.md` — a plain `.md` working artifact (no `.swarm.` infix; the infix marks compiler-parsed/emitted files, which a coordination record is not), generated and updated by hand as the run proceeds (see the the `decompose` pass orchestration contract). Its shape and discipline are restated in the Coordination-record section below; field-by-field detail lives one hop away in `references/coordination-record.md`.

## Preserves

`decompose` is bound by the distillation-loss discipline (see the `lower` pass): the two `LOWER` passes MUST NOT drop an obligation id, modality, actor, trigger, response, constraint, invariant, verification binding, or authority. The COVERAGE gate (below) is its structural complement — distillation-loss forbids *dropping* an obligation during lowering; COVERAGE forbids *stranding* one afterward. Together they make the lowered work a bijection over obligations: nothing lost, nothing uncovered or pointed at a phantom (see the `decompose` pass). Applied at `decompose`: when summarizing obligations into packets, account for every dropped vs kept obligation, never paraphrase one away (the loss-budget table lives in the `lower` pass).

## Rejects

Refuse, and emit no plan claim, when any of these hold:

- A packet whose owned paths fall outside the union of its assigned obligations' declared `WRITES` surfaces — the owned-path containment violation, `SOL-O005` (see the SOL error catalogue and the `decompose` pass). *Why:* an owned path outside the declared surface is the hidden write the conflict graph cannot see, so the disjointness proof silently stops holding.
- Two conflicting packets (sharing a write surface, a boundary node, or a read/write conflict) marked into the same parallel batch — `SOL-O001`, raised to **ERROR** because a write-conflict marked parallel is the precise failure that produces silent merge corruption (see the `decompose` pass).
- A partition that leaves any obligation uncovered (`SOL-O007`) or double-owned across two `implement` packets (`SOL-O008`) — the COVERAGE gate's blocking conditions (see the `decompose` pass).
- Any plan that adds a fifth top-level key, ships a `locks` field, uses a pass outside the closed nine-pass set, or duplicates an inter-packet relationship outside `edges[]` (see the `decompose` pass).
- A request to **author intent** in the plan or coordination record — a new `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`. Behavior a packet needs but no assigned obligation covers is a promotion item routed back to a spec, never silently absorbed (see the the `decompose` pass orchestration contract). *Why:* the plan is a derived projection of the spec; intent authored here would not be lint-checked, lowered, or covered.
- A request to assign verdicts or evaluate the merge gate — `review`/`verify` concerns (the verdict model and merge gate, see the `review` pass). `decompose` only emits the static contract they read.

## Procedure

1. **Read the IR, not the prose.** Load `*.swarm.ir.json` and its two derived graphs (see the `decompose` pass). Resolve every obligation's `WRITES`/`READS` to `SURFACE` path-pattern sets, noting any `append-only`/`integration`/`shared` attribute (see the `decompose` pass). If a `SURFACE` is unnamed, treat each raw path/glob as its own singleton pattern set (see the `decompose` pass). *Why:* the partition is computed over declared access sets, never against a live filesystem and never by guessing — there is no runtime.

2. **Partition into write-disjoint packets.** Group obligations into the smallest set of packets where each is a single pass (under an optional profile) over a selected set of scoped obligations. How finely to split is your heuristic as carrier (see [`../persona-lead-engineer/SKILL.md`](../persona-lead-engineer/SKILL.md)); the kernel fixes only the predicate (step 5) the partition must satisfy. Carry into each packet its assigned obligations, the constraints/invariants in force, the interfaces it touches, its write surfaces, and its verification bindings (see the `lower` pass and [`../../templates/task.md`](../../templates/task.md)). When two candidate sub-tasks need the same file they are not independent — sequence them with a `DEPENDS ON` edge rather than parallelizing (Lead Engineer hard constraint, [`../persona-lead-engineer/SKILL.md`](../persona-lead-engineer/SKILL.md); see also the `decompose` pass). *Why:* two tasks writing the same surface are not write-disjoint, so parallelizing them is the silent merge corruption `SOL-O001` exists to prevent.

3. **Project owned paths and check containment.** For each packet, derive its `writes` as the file/glob projection of its assigned obligations' `WRITES` surfaces. Each owned pattern set MUST be a subset of that union under the subset semantics in the `decompose` pass — every path the owned set matches must also be matched by the declared `WRITES` set. An owned path touching a file outside any assigned obligation's declared write surface is the disjoint-scope violation `SOL-O005`; fix it by re-scoping the packet (shrink OWNED) or widening the obligation's `WRITES` in the source spec (add the surface) — never silently (see the `decompose` pass). *Why:* the two tiers may not diverge silently, or the source and execution partitions stop describing the same work.

4. **Compute merge order.** Build the partial order from the `depends_on` edges (the dependency DAG `lower` already proved acyclic; a cycle is `SOL-O002`). Each packet's `depends_on[]` array is the *declaration*; emit a matching `depends_on`-type edge in `edges[]` so ordering is computable from the graph, not just packet scalars (see the `decompose` pass). *Why:* a relationship recorded only as a scalar can't be re-derived by a reviewer reading the graph.

5. **Apply the single safe-parallelism predicate to set `merge_safe`.** Use the kernel's **one** predicate verbatim — no relaxed alternative is permitted (see the `decompose` pass). Two packets `a` and `b` may run in parallel **iff** they are dependency-independent **and** write-disjoint:

   ```text
   parallel_safe(a, b)  ⇔
         ¬reachable_DAG(a, b) ∧ ¬reachable_DAG(b, a)   # dependency-independent
      ∧  writes(a) ∩ writes(b) = ∅                     # no shared write surface
      ∧  ¬shares_interface_or_migration(a, b)          # no shared boundary node
      ∧  ¬readwrite_conflict(a, b)                      # read/write conflict
   ```

   Compute overlap and subset **syntactically over the glob pattern lattice** (`**` = any number of segments, `*` = one segment never `/`, `?` = one character; see the `decompose` pass) — string inequality does **not** imply disjointness, and the test is never against a live filesystem (Principle 1). Two packets share a boundary node iff both reference the same `INTERFACE` via `DEPENDS ON`/`AFFECTS` (an INTERFACE has no `WRITES`, so it enters the graph only through these edges), or both write an `integration`/`shared` surface. Read/read never conflicts; read/write and write/write do (see the `decompose` pass). Set `merge_safe: false` whenever the predicate fails, a packet has an unresolved `conflicts_with` edge to a batch-mate, or any input is unscoped (empty `writes` where a write is implied). *Why:* a relaxed predicate would let two implementations derive different conflict graphs from the same spec.

   Honour the two non-weakenable defaults (see the `decompose` pass): **unscoped serializes** — an obligation with no `WRITES` is assumed to conflict with everything and MUST NOT be co-scheduled in a parallel batch (the write side stays single-threaded by default, ADR 0010); **shared serializes** — any obligation touching a `shared`/`integration` surface or a shared `INTERFACE` serializes. The verdict is *static*: a launcher MAY serialize further but MUST NOT parallelize a pair the plan marks unsafe. Read-only passes (`lint`, `review`, any pass declaring only `READS`) MAY run broadly in parallel. *Why:* a missing scope is a hidden conflict; treating "unknown" as "safe" is the one assumption that produces unreviewable corruption.

6. **Run the COVERAGE gate (the `LOWER → EXECUTE` checkpoint, before any `implement`).** The gate writes no artifact; it is a precondition predicate over the IR `nodes[]`/`edges[]` and the plan `packets[]` (see the `decompose` pass). For every lowered obligation node (`REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`, including each `AND THE`-split sub-obligation), count the `implement` packets whose `inputs` include it:

   ```text
   count == 0  -> SOL-O007  (uncovered obligation)      [BLOCKING] — assign to one packet, or record an explicit non-goal
   count > 1   -> SOL-O008  (double-owned obligation)    [BLOCKING] — re-assign to exactly one packet
   ```

   Then check that every `verified_by` edge and every TRACE `implements`/`preserves` edge resolves to a real node id in `nodes[]`; an unresolved target is an orphan (`SOL-M003`, surfaced at `review`). The count is *per `implement` packet* — an obligation legitimately recurs across its `implement`, `verify`, and `review` packets. All BLOCKING conditions MUST clear before any `implement` pass runs. *Why:* COVERAGE is the structural complement of distillation-loss; together they make the lowered work a bijection — nothing dropped, nothing stranded.

7. **Emit the plan.** Write the four-key envelope (see the `decompose` pass) and one `task.md` per packet (see [`../../templates/task.md`](../../templates/task.md)). Mirror every `depends_on[]` as a `depends_on` edge and every shared-surface or read/write conflict as a `conflicts_with` edge in `edges[]` (see the `decompose` pass). Set `meta.derived_from`, `language`, `version`, and (optionally) the advisory `max_parallel`. Frame the artifact as the contract a future tool emits and a future launcher consumes — never the output of a shipped emitter or live scheduler (see the `decompose` pass).

8. **If the run fans out, emit the coordination record.** When concurrent workers will execute the plan, generate the `task-orchestration.md` (see the the `decompose` pass orchestration contract) — see the next section. It is the one place the parallel run is *recorded*; it never authors intent and never widens a worker's reach.

Rationale for the contract-not-scheduler stance: a simple localize→repair→validate pipeline reaches high performance among software agents without live multi-agent scheduling, so a static plan suffices; the write side stays single-threaded because conflicting concurrent actions carry conflicting decisions, and agents are not yet reliable at real-time coordination, so parallelism is opt-in and write-disjoint by default. A recorded per-packet hand-off contract attacks the two largest multi-agent failure modes — fuzzy specification and inter-agent misalignment — by fixing scope, order, and surfaces statically before any `implement` run.

## The coordination record (when the run fans out)

The coordination record `task-orchestration.md` is the single canonical record for one parallel decomposition: who owns which surfaces, what each worker was handed, whether each is still progressing, and how every branch merged back. Its stance is **derived projection plus recorded fact** — the partition is *derived* (each worker's OWNED surfaces are the file/glob projection of its assigned obligations' `WRITES`, lowered in steps 2–3, not invented here), and the hand-offs, stall decisions, and merge resolutions are *facts about the run*, recorded so the run is reconstructable from the artifact alone. It has **no copyable skeleton** — not started from a blank template, but generated and updated as the run unfolds. Field tables and the worked example are one hop away in `references/coordination-record.md`.

What it MUST do:

- **Record a disjoint partition.** The OWNED paths across all workers MUST be pairwise non-overlapping, confirmed *before* any worker is spawned. A `## Worker tracker` carries one row per worker with its OWNED and FORBIDDEN (the union of every other worker's OWNED) paths. *Why:* the FORBIDDEN column makes the boundary reviewable rather than implicit.
- **Record each hand-off as data** — objective, expected deliverable, acceptance bar (the obligations that MUST reach `PASS`), and boundaries (OWNED/FORBIDDEN plus preserved constraints/invariants). The same text is carried *verbatim* into the worker's child `task.md` as its `## Parent contract`. *Why:* vague subtask descriptions and inter-agent misalignment are the dominant multi-agent failure mode; recording the hand-off as data is the countermeasure.
- **Record liveness as data** in a `## Decisions` log — a per-worker progress marker, the recorded STALL threshold (no progress across two consecutive checks → `stalled`), and the one STALL action taken (re-plan / re-scope / escalate / abandon) with its rationale. *Why:* a worker hung in-progress or silently diverging is otherwise invisible state — the kernel has no runtime to detect it.
- **Record the merge history** in a `## Merge log` — merge order, conflicts, and resolution, with an **INTENT-PRESERVED-PROOF** for every non-trivial conflict. That proof MUST show *both* sides' intent was kept, not merely that the suite is green; the equivalence oracle is a property/differential/metamorphic check on the conflicted region (a green suite alone suffices only for a trivial fast-forward merge). *Why:* schema-valid / green output is not verification — the suite may not cover the interaction the merge changed.

What it MUST NOT do: author intent; widen a worker's reach past its assigned obligations' `WRITES` (an OWNED path outside that union is `SOL-O005`); mark an overlapping pair parallel (`SOL-O001`); or be the only home of any durable fact (on reconciliation the durable record is the ledger entry, the updated status, and any promoted findings — the coordination record itself is disposable generated execution material).

Verification bindings the acceptance bar names resolve through the consuming repo's `AGENTS.md > Commands` `cmd*` slots (`VERIFY BY test:cmdTest:…` resolves `cmdTest` there; likewise `cmdValidate`/`cmdFormat`/`cmdBenchmark`/`cmdLint`/`cmdTypecheck`). If a needed slot is undefined, **ask the user** — never guess a command. *Why:* the plan is stack-agnostic; the concrete command is a project value, not a kernel value.

## Output contract

- A `*.swarm.plan.json` that is a conformant SOL/0.1 plan (see the `decompose` pass): exactly the four top-level keys; every required field populated (optional fields defaulted); **no `locks` field anywhere**; only the closed nine-pass set in `packets[].pass` and the closed edge-type set in `edges[]`; inter-packet relationships represented **once**, as edges; the three version fields (`meta.version`, the IR's `version`, the spec content version) kept distinct.
- One `task.md` per packet, each carrying its assigned obligations, scope (owned paths ⊆ declared `WRITES`), `depends_on` order, and verification bindings (see [`../../templates/task.md`](../../templates/task.md)). A fanned-out worker's `task.md` carries the hand-off verbatim as its `## Parent contract`.
- When the run fans out: a `task-orchestration.md` (plain `.md`, no `.swarm.` infix) with frontmatter (`type: task-orchestration`, `id`, `source`, `parallel_group`, `created`) and the four ordered sections — provenance note, `## Worker tracker`, `## Decisions`, `## Merge log` — its OWNED partition pairwise-disjoint and lowered from the obligations.
- Every packet's `merge_safe` set by the safe-parallelism predicate verbatim (see the `decompose` pass), the two non-weakenable defaults honoured.
- The COVERAGE gate cleared: no `SOL-O007`, no `SOL-O008`, no unresolved `verified_by`/`implements`/`preserves` target.

For the `auth-refresh` worked fragment (see the `decompose` pass), a conformant plan groups one `INTERFACE`, one dependent `REQ`, and one `INVARIANT` into three packets: WP-001 (`implement` the interface contract, `batch: 0`) is `merge_safe: false` because it freezes a shared interface contract; WP-002 (`implement`, depends on WP-001, write-disjoint from its batch-mates, `batch: 1`) and WP-003 (`verify`, depends on WP-002, `batch: 2`) are `merge_safe: true`. The matching `references/coordination-record.md` shows the fan-out of this same fragment.

## Anti-patterns

- ❌ Computing disjointness by string comparison (`src/auth/**` vs `src/auth/client.ts` "look different, so disjoint") → compute overlap/subset over the glob pattern lattice (see the `decompose` pass); `**` matches any number of segments, so those two **overlap** and conflict. "Different string" is not "disjoint surface."
- ❌ Marking an unscoped obligation (empty `writes`) `merge_safe: true` because "it probably doesn't touch anything the others do" → unscoped serializes by default (see the `decompose` pass); an unknown write set is assumed maximal. Treating unknown as safe is the one assumption that produces unreviewable merge corruption.
- ❌ Co-scheduling two packets that both write a `shared`/`integration` surface (e.g. CI config, a migration) → shared serializes (see the `decompose` pass); these are hidden high-conflict surfaces even when the visible feature work is disjoint.
- ❌ Inventing a `verify_by` binding for an obligation that arrived without one → a `SOL-V001` defect `improve` should have answered; surface it, never launder it past the gate.
- ❌ Authoring a new `REQ`/`CONSTRAINT` directly into the plan or worker tracker because a packet "obviously needs it" → a promotion item routed back to a spec; intent authored here is never lint-checked, lowered, or covered.
- ❌ Widening a worker's OWNED set so a touched path fits, instead of fixing the source → silent divergence between source and execution tiers (`SOL-O005`); shrink OWNED or widen the obligation's `WRITES` in the spec, never silently in the record.
- ❌ Recording a merge resolution as "tests pass on the merged branch" for a non-trivial conflict → green is necessary but not sufficient; record the INTENT-PRESERVED-PROOF (property/differential/metamorphic check) that both sides' intent survived.
- ❌ Adding a `locks` field, a fifth top-level key, or duplicating a `depends_on` relationship as both a packet scalar *and* a separate non-`edges` location → non-conformant plan (see the `decompose` pass); a lock group *is* a named write SURFACE, relationships live once in `edges[]`.
- ❌ Describing the plan or coordination record as something a shipped emitter produced or a live scheduler runs → there is no runtime (Principle 1); both are static contracts a human/agent populates by hand and a future launcher could one day consume.
- ❌ Hardcoding a concrete test/validate command into a packet's bindings → resolve `cmd*` slots through the consuming repo's `AGENTS.md > Commands`; if a slot is undefined, ask the user.

## Self-review delta

Before handing off, confirm — and paste real evidence where a step produces it; an assertion without the artifact is not a proof (the execution failure mode is a step claimed but silently skipped):

- [ ] **Re-derivable.** Could a fresh agent re-derive the conflict graph and `merge_safe` verdicts from the IR + plan alone, no state in your head (see the `decompose` pass)? If you cannot point to the `edges[]` and `writes` justifying each verdict, it is not re-derivable.
- [ ] **Containment.** Every owned path is a subset of its obligations' declared `WRITES` (no `SOL-O005`), and no conflicting pair is marked into one parallel batch (no `SOL-O001`).
- [ ] **COVERAGE cleared.** Paste the per-`implement`-packet coverage count for every obligation node: each is `count == 1` (no `SOL-O007`, no `SOL-O008`), and every `verified_by`/`implements`/`preserves` target resolves to a real node id (see the `decompose` pass). A claimed "coverage passes" without the counts is not a proof.
- [ ] **Lattice, not strings.** Overlap/subset computed over the glob pattern lattice (see the `decompose` pass), not by string equality.
- [ ] **Defaults honoured.** Nothing unscoped or `shared`/`integration` silently landed in a parallel batch — it MUST serialize (see the `decompose` pass).
- [ ] **Conformant envelope.** Exactly four top-level keys, no `locks` field, only the closed nine-pass set, relationships once in `edges[]`, three version fields distinct (see the `decompose` pass).
- [ ] **Distillation-loss.** Every obligation, modality, actor, constraint, invariant, verification binding, and authority survived the partition (see the `lower` pass).
- [ ] **No authored intent.** Neither the plan nor the coordination record carries a new obligation; discovered behavior was routed as a promotion item.
- [ ] **Contract, not scheduler.** The plan and coordination record are framed as static contracts a launcher would consume, no claim of a running scheduler, emitter, or live batching (see the `decompose` pass).
- [ ] **Commands resolved or asked.** Every `VERIFY BY` binding in a packet resolves a defined `AGENTS.md > Commands` `cmd*` slot; any undefined slot was raised to the user, not guessed.
