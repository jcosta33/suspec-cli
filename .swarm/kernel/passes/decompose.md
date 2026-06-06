# The `decompose` pass

`decompose` is the fifth of the **nine passes** of the Swarm compiler pipeline (`author -> lint -> improve -> lower -> decompose -> implement -> verify -> review -> promote`). It shares the `LOWER` phase with `` `./lower.md` ``: where `lower` builds the IR obligation graph, `decompose` **partitions that graph into schedulable work packets** and produces the write-surface partition on which all safe parallelism rests. This file is the contract that defines that partition. It is self-standing — the authority for this pass lives here.

Like every Swarm pass, `decompose` has **no runtime**. It is a contract a human, an agent following a pass guide, or a future tool performs. The plan it produces is documented, versioned data — the shape a launcher would consume — never the output of a shipped emitter, and never a live scheduler. Plan derivation *is* the `decompose` pass; what stays out of the kernel is the scheduler/harness that would execute the plan's packets live across agents (a launcher concern).

## What the pass does

The `decompose` pass **partitions the obligation graph into task-sized, write-disjoint work packets** with their assigned obligations, write surfaces, and verification bindings. Deliberate decomposition into a searchable structure of sub-units, rather than flat one-shot generation over the whole spec, is what makes the downstream work tractable.

| Aspect | Value |
|---|---|
| Phase(s) | **`LOWER`** (shared with `lower`) |
| Input artifact | `*.swarm.ir.json` (the IR obligation graph + the two derived graphs) |
| Output artifact | `../templates/task.md` work packets; and, named-as-contract, `*.swarm.plan.json` (`auth-refresh.swarm.ir.json` → `auth-refresh.swarm.plan.json`) |
| Typical carrier profile | Lead Engineer |
| Lint layer | `SOL-O###` (orchestration: scope/ownership, e.g. `SOL-O001`, `SOL-O005`, `SOL-O007`, `SOL-O008`) |

`decompose` ships a **dedicated stdlib pass guide**, carried by the Lead Engineer profile — it is the machinery the obligation graph needs to become schedulable, and it gates safe parallelism. (`lint`, `decompose`, `review`, and `promote` each ship a dedicated pass guide; `implement` is served by the nine per-`task_kind` guides and `author` by the six author guides; `improve` and `lower` ship no guide; `verify` is served by the `empirical-proof` fragment.)

`decompose` consumes the **IR, not the surface spec**: it MUST operate on `*.swarm.ir.json` so that work-packet boundaries are computed from the typed graph (the two derived graphs below), not re-parsed from prose.

## The three obligations of the pass

The pass MUST:

1. **Partition obligations into work packets** — each packet carrying its assigned obligations, the constraints/invariants in force, the interfaces it touches, its write surfaces, and its verification bindings (the `../templates/task.md` contract). Each produced `task.md` is the lowered work packet for one pass — the unit a single `implement` run owns.
2. **Project owned paths** for each packet as the file/glob projection of its assigned obligations' `WRITES` surfaces. Owned paths MUST be a subset of that union — the owned-path containment rule (lint `SOL-O005`); an owned path touching a file outside any assigned obligation's declared write surface is the disjoint-scope violation. This is the lowering tie made precise below.
3. **Compute merge order** from the `depends_on` edges (the dependency DAG) as a partial order, and **prove pairwise disjointness** of the owned paths of any two packets scheduled in parallel, using the write-surface conflict graph.

`decompose` is bound by the distillation-loss discipline (`../skills/distillation-discipline/SKILL.md`): the two `LOWER` passes MUST NOT drop an obligation id, modality, actor, trigger, response, constraint, invariant, verification binding, or authority. An obligation reaching `decompose` with no `verify_by` is a `SOL-V001`-class defect that `BIND` should have answered during `` `./improve.md` ``.

## The scope vocabulary `decompose` partitions over

The partition `decompose` produces is computed entirely from **declared access sets** carried by the obligations — never from a live filesystem and never by guessing. Those access sets enter through three layers of vocabulary, all defined here because `decompose` is where they combine into the write-surface partition: the per-obligation **scope clauses**, the **named SURFACEs** they resolve against, and the **two derived graphs** that fall out of them.

### The scope declarations (the five clauses)

Every obligation block (REQ, CONSTRAINT, INVARIANT) MAY carry scope-declaration metadata in the trailing-metadata position of the SOL surface syntax (`../language/SOL.md`). Surface keywords are UPPERCASE and space-separated; each lowers to a `snake_case` IR field. Five clauses are load-bearing for decomposition — four declared on the obligation, plus the worker-level `OWNED BY` projection the partition produces:

| Surface clause | IR field | Declares | Graph contribution |
|---|---|---|---|
| `WRITES <surface-list>` | `writes` | The write surfaces (named SURFACEs or paths/globs) the obligation mutates. | Write-surface conflict graph. |
| `READS <surface-list>` | `reads` | The read set the obligation depends on but does not mutate. | Read/write conflict edges. |
| `TOUCHES <surface-list>` | `touches` | Surfaces the obligation touches but does not own or write. | Advisory; outside the write-disjointness predicate. |
| `DEPENDS ON <id-list>` | `depends_on` **edge** | Hard ordering: this obligation MUST be satisfied after the listed obligations. | Dependency DAG. |
| `AFFECTS <id-list-or-surface>` | `affects` **edge** | The impact set: obligations or surfaces that may be perturbed but are not directly written. | Soft `affects` conflict edge. |
| `OWNED BY <worker>` | `owner` | The execution-tier projection: the worker/packet that owns this obligation's write surfaces. Produced by `decompose`, not authored on the source obligation. | Subject to OWNED ⊆ WRITES (lint `SOL-O005`). |

`AFFECTS` MUST lower to an `affects` edge in the IR, never folded into `writes` or `depends_on`. `DEPENDS_ON` (underscore) is **not** a surface keyword — it is only the IR edge-type transcription; a source author writing `DEPENDS_ON` in `.swarm.md` is a keyword-form error (`SOL-S002`-adjacent). The surface keyword is exactly `DEPENDS ON` (two words). Relationships are emitted **once**, as IR `edges[]`, never duplicated as node scalars in the conflict analysis.

A worked obligation and its lowered IR fragment:

```sol
REQ AC-014:
  WHEN refresh.token IS expired
  THE auth-client MUST request a new access token
  VERIFY BY test:cmdTest:tests/auth/test_refresh.py#test_expired_triggers_refresh
  DEPENDS ON AC-010
  WRITES auth.client.code
  READS auth.config
  AFFECTS AC-022
  RISK high
```

```json
{
  "id": "REQ.auth-refresh.AC-014",
  "kind": "REQ",
  "writes": ["auth.client.code"],
  "reads": ["auth.config"]
}
```

The node carries only its intrinsic scope sets; the `DEPENDS ON`/`AFFECTS` relationships are **not** node scalars — they are carried as edges (the single source of relationship truth):

```json
{"from": "REQ.auth-refresh.AC-014", "to": "REQ.auth-refresh.AC-010", "type": "depends_on", "hard": true},
{"from": "REQ.auth-refresh.AC-014", "to": "REQ.auth-refresh.AC-022", "type": "affects", "hard": false}
```

### Named SURFACEs and their attributes

A **write surface** is a named coarse region declared with the SOL `SURFACE` statement. There is **no `locks` primitive** anywhere on the surface or IR layer: a lock group *is* a named SURFACE, so lock-set analysis reduces to write-set analysis at surface granularity. This is why the work-packet record carries no `locks` field — conflict is computed over surfaces, not over an orthogonal lock vocabulary.

```ebnf
surface_decl = "SURFACE", ws, surface_name, ws, "=", ws,
               glob, { ws, ",", ws, glob },
               [ ws, "[", surface_attr, "]" ], nl;
surface_attr = "append-only" | "integration" | "shared";
```

```sol
SURFACE auth.client.code = src/auth/client/**
SURFACE auth.config      = config/auth.yaml
SURFACE repo.lockfile    = package-lock.json [append-only]
SURFACE ci.config        = .github/workflows/** [shared]
SURFACE db.migrations    = migrations/** [integration]
```

An obligation's `WRITES` clause SHOULD reference named SURFACEs rather than raw globs, because named surfaces make the conflict graph stable under file moves and let one attribute govern many obligations. A raw path in `WRITES` is treated as an anonymous singleton surface for conflict analysis.

The optional `[attr]` tag changes how the partition treats a surface for both conflict and staleness:

| Attribute | Conflict treatment | Staleness treatment | Typical surfaces |
|---|---|---|---|
| *(none)* | Ordinary **exclusive** write surface: any two obligations that both `WRITES` it conflict and serialize. | Modification after last PASS → `STALE`. | Feature source, test files. |
| `append-only` | Concurrent appends do **not** conflict (no shared mutable region); the surface MUST NOT be edited in place. | An append MUST NOT mark unrelated proofs STALE; only a non-append edit triggers blanket staleness. | Lockfiles, changelogs, manifests. |
| `integration` | Writes serialize through a single dedicated integration step rather than blocking feature work; treated as a high-conflict surface routed to one worker/pass. | Modification marks STALE only obligations whose proof exercised the integration surface. | Migrations, shared schemas. |
| `shared` | Treated as a hidden high-conflict surface: writes serialize by default; never co-scheduled in a parallel batch. | Does NOT trigger blanket staleness across the spec; staleness is scoped to proof-exercised obligations. | CI config, project-wide manifests, global config. |

The attributes exist because shared/global/append-only files (lockfiles, CI definitions, manifests) function as hidden high-conflict surfaces even when the visible feature work is disjoint. Without an attribute the partition would either over-serialize honest feature work or, worse, treat a lockfile touch as an ordinary write conflict and force a blanket re-verification. The attribute lets the partition be correct in both directions.

### The two derived graphs

From the scope clauses and SURFACE declarations, `decompose` consumes (and `lower` emits) exactly **two coordination graphs** in the IR `edges[]`. These two graphs are the entire mechanical substrate of safe parallelism; the kernel derives them, it never schedules against them.

1. **The dependency DAG** — built from every `DEPENDS ON` clause as `depends_on` edges. It MUST be acyclic; a cycle is an ORCHESTRATION-layer error (`SOL-O002`). Topologically sorting it yields the **legal partial order of work** — the merge order packets must respect.
2. **The write-surface conflict graph** — an undirected graph whose nodes are obligations and whose edges connect any two obligations that are **not write-disjoint**. Two obligations share an edge iff they write the same exclusive surface, or both write a `shared`/`integration` surface, or stand in a read/write conflict on the same surface. This graph is the proof that any two packets `decompose` marks parallel-safe have pairwise-disjoint owned paths.

```text
spec.swarm.md
   │  (lower emits, decompose consumes)
   ├──► dependency DAG          (from DEPENDS ON)                     → legal merge order
   └──► write-surface graph     (from WRITES / SURFACEs / READS)      → safe parallel batches
```

The dependency DAG answers *what order*; the write-surface conflict graph answers *what may run at the same time*. `decompose` uses the first to compute each packet's `depends_on` partial order and the second to assign each packet's `merge_safe` verdict.

### The READS conflict rule (conflict-serializability)

Read/write coordination follows **conflict-serializability** semantics, evaluated per surface:

| Pair on the same surface | Conflict? | Edge emitted |
|---|---|---|
| read / read | **No** — always parallel-safe | none |
| read / write | **Yes** — conflict | conflict edge in the write-surface graph |
| write / write | **Yes** — conflict | conflict edge in the write-surface graph |

Two obligations that both only `READS` a surface MUST be schedulable in parallel — read/read never conflicts. But if one `READS` a surface another `WRITES`, they MUST be connected by a conflict edge and serialized: the reader runs strictly before or strictly after the writer in the DAG order. Reads on *different* surfaces never conflict. `AFFECTS` contributes a soft `affects` edge the predicate treats as advisory (a reviewer signal), not a hard conflict — unless the affected surface also appears in a `WRITES` set.

Worked: `AC-014` (`READS auth.config`) and `AC-031` (`WRITES auth.config`) MUST serialize; `AC-014` (`READS auth.config`) and `AC-040` (`READS auth.config`) MAY run in parallel. This is why read-only passes (`` `./lint.md` ``, `` `./review.md` ``, and any pass declaring only `READS`) MAY run broadly in parallel.

## The plan: the schedulable projection of the IR

The **plan** takes the IR obligation graph and groups the work needed to discharge those obligations into work packets. Where the IR answers "what must hold and how do the obligations relate," the plan answers **"what units of work exist, in what order, on which surfaces, and which of them are safe to run at the same time."** The plan is the kernel's static coordination contract; it is *not* a running scheduler.

> **Contract, not executor (normative).** Plan derivation *is* the `decompose` pass — there is no separate "planner" step. What is **out of the kernel** is the scheduler/harness that would execute the plan's packets live across agents (a launcher concern). A conformant repository MUST include the documented plan schema and MUST frame any `.swarm.plan.json` as the contract a future tool emits and a future launcher consumes, never as the output of a shipped tool.

### Top-level envelope

A SOL plan document MUST be a single JSON object with **exactly four keys**, reusing the IR's structural discipline:

| Key | JSON type | Cardinality | Purpose |
|---|---|---|---|
| `meta` | object | exactly 1 | Plan-level identity; the IR it derives from; the three distinct version fields. |
| `packets` | array of work-packet objects | 0..n | The schedulable work units. |
| `edges` | array of edge objects | 0..n | Inter-packet relationships — the single-source-of-relationship-truth rule (the same discipline the IR uses). |
| `provenance` | object | exactly 1 | Emission facts; same shape as the IR's `provenance`. |

Relationships between packets live **only** in `edges[]`, never duplicated as packet scalars; the per-packet `depends_on[]` array is the *declaration*, and `decompose` MUST also emit a matching `depends_on`-type edge so ordering is computable from the graph.

### `meta`

`meta` carries `id` (matches the source IR's `meta.id`), `derived_from` (path to the `*.swarm.ir.json`), `language` (`SOL/0.1`), `version` (the spec content version), and an optional `max_parallel` (`integer|null`). `max_parallel` is an **advisory parallelism hint for a launcher**; `null` = unspecified. The kernel computes *safety*; concurrency *limits* are launcher policy, not kernel concern.

### `packets[]` — work packets

A **work packet** is one schedulable unit: a single pass applied (under an optional profile) to a selected set of obligations, with declared scope, ordering, and a merge-safety verdict.

| Field | Required | Meaning |
|---|---|---|
| `id` | MUST | Packet identifier, unique within the plan. |
| `pass` | MUST | One of the 9 passes (`author`, `lint`, `improve`, `lower`, `decompose`, `implement`, `verify`, `review`, `promote`). |
| `profile` | MAY | Heuristic profile parameterizing the pass (e.g. `skeptic` on `review`, `lead-engineer` on `decompose`); `null` = the pass's default. |
| `inputs` | MUST | The node ids (obligations/questions/traces) this packet consumes. |
| `outputs` | MUST | The artifacts it produces (code paths, `*.swarm.trace.md`, `review.md`, `finding.md`, …). |
| `writes` | MUST (MAY be empty) | The write SURFACE ids it modifies, derived from its inputs' `writes` scope sets. Every write surface here MUST be a subset of its obligations' declared `WRITES` (lint `SOL-O005`). |
| `reads` | MUST (MAY be empty) | The read surfaces it touches. |
| `depends_on` | MUST (MAY be empty) | Packet ids that MUST complete first — the merge-order partial order. Each entry MUST also appear as a `depends_on` edge. |
| `lane` | MAY | Suggested execution lane/worker label. Launcher hint only; absence does not affect safety. |
| `batch` | MAY | Suggested wave/round index for staged fan-out. Launcher hint only. |
| `merge_safe` | MUST | The kernel's verdict on whether the packet may run concurrently with its batch-mates. |

There is **no `locks` field anywhere** in the record: a lock group *is* a named write SURFACE, so lock-set analysis reduces to the write-set analysis already computed over the conflict graph. The record carries both the *pass/profile* dimension (what work, under which profile) and the *scope/dependency* dimension (which surfaces, in what order) in one shape.

Inter-packet edges use the IR edge object `{from, to, type, hard}`. The relevant types are `depends_on` (ordering) and `conflicts_with` (a shared write surface, or a read/write conflict). A `conflicts_with` edge to a batch-mate is what forces `merge_safe: false`.

## The safe-parallelism predicate (single, canonical)

`merge_safe` is the surface of the kernel's **one** safe-parallelism predicate. Conformant tools and authors MUST use it verbatim; no alternative or relaxed predicate is permitted in v0.1.

> **Two work packets MAY run in parallel if and only if they are dependency-independent AND write-disjoint** — neither is reachable from the other in the dependency DAG, **and** they share no write surface and no shared boundary node (a shared `INTERFACE` referenced via `DEPENDS ON`/`AFFECTS`, or a shared `integration`/`shared` surface). Anything unscoped or shared **serializes by default**.

Formally:

```text
parallel_safe(a, b)  ⇔
      ¬reachable_DAG(a, b) ∧ ¬reachable_DAG(b, a)   # dependency-independent
   ∧  writes(a) ∩ writes(b) = ∅                     # no shared write surface
   ∧  ¬shares_interface_or_migration(a, b)          # no shared boundary node
   ∧  ¬readwrite_conflict(a, b)                      # the READS conflict rule above
```

Two defaults are normative and MUST NOT be weakened:

- **Unscoped serializes.** An obligation with no `WRITES` clause is treated as conflicting with *every* other obligation (its write set is unknown, hence assumed maximal) and MUST NOT be co-scheduled in a parallel batch — a missing scope is a hidden conflict, and the write side stays single-threaded by default.
- **Shared serializes.** Any obligation touching a `shared` or `integration` SURFACE, or any `INTERFACE` referenced via `DEPENDS ON`/`AFFECTS`, MUST serialize.

Read-only passes (`` `./lint.md` ``, `` `./review.md` ``, and any pass declaring only `READS`) MAY run broadly in parallel, because read/read never conflicts.

`merge_safe` MUST be `false` if a packet has any unresolved `conflicts_with` edge to a batch-mate, or if any of its inputs is unscoped (empty `writes` where a write is implied). It is the kernel's *static* verdict: a launcher MAY further serialize for its own reasons but **MUST NOT parallelize two packets the plan marks unsafe.** The binding constraint on safe parallelism is review entropy and merge collisions, not agent count.

### Surface comparison semantics

The predicate's set operations are defined **syntactically over path patterns**, never against a live filesystem (no runtime):

- **Surface resolution.** Each `SURFACE` name resolves to its declared repo-relative path patterns; a raw path/glob in `WRITES`/`READS` is its own singleton pattern set. The glob dialect is a fixed POSIX-style subset: `**` matches any number of path segments, `*` matches exactly one segment (never `/`), `?` matches one character; every other character is literal.
- **Overlap** (`writes(a) ∩ writes(b) ≠ ∅`). Two surfaces overlap iff their pattern *languages* intersect (e.g. `src/auth/**` overlaps `src/auth/client.ts`). **String inequality does NOT imply disjointness.**
- **Subset** (OWNED ⊆ WRITES, `SOL-O005`). An owned pattern set is a subset of a `WRITES` pattern set iff every path it matches is also matched by the `WRITES` set, under the same semantics.
- **Boundary nodes** (`shares_interface_or_migration`). Two packets share a boundary node iff both reference the same `INTERFACE` id via `DEPENDS ON`/`AFFECTS` (an INTERFACE has no `WRITES`, so it enters the conflict graph only through these edges), or both write an `integration`/`shared` surface (the "migration node" case).

A conformant tool MUST compute overlap and subset over this pattern lattice, so that **two implementations derive the identical conflict graph from the same spec.**

## The lowering tie: OWNED ⊆ WRITES

The owned paths `decompose` projects onto each packet (the second pass obligation above) are bound to the obligations' declared write surfaces by **one normative lowering rule**:

> A packet's (or worker's) OWNED paths MUST be a **subset** of the union of its assigned obligations' declared `WRITES` surfaces, lowered to their file/glob projection.

This is the bridge between the **source tier** (the `.swarm.md` obligations and their `WRITES` clauses) and the **execution tier** (the packet/worker that owns paths on disk). The subset is computed under the same pattern-language semantics as surface overlap above: an owned pattern set is a subset of a `WRITES` pattern set iff every path it matches is also matched by the `WRITES` set.

```text
source tier (.swarm.md)            execution tier (work packet / worker)
  obligation.WRITES   ──project──►  packet.OWNED   (subset; else SOL-O005)
  obligation.DEPENDS ON ──────────► merge order (partial order from the dependency DAG)
  write-surface conflict graph ───► OWNED paths pairwise disjoint across parallel packets
```

A worker owning a path **outside** its obligations' declared write surfaces is the disjoint-scope violation, lint **`SOL-O005`** (ORCHESTRATION, **ERROR**):

```text
SOL-O005  ERROR  worker "auth-core" owns src/auth/server/** which is outside its obligations'
          declared WRITES {auth.client.code}; either re-scope the worker or add the WRITES surface
```

The fix is one of two moves — **shrink** the OWNED set (re-scope the worker) or **widen** the declared write set (add the surface to the obligation's `WRITES` clause in the source spec). Neither tier may silently diverge: an owned path outside the declared surfaces is exactly the hidden write the conflict graph cannot see and the disjoint-scope invariant cannot protect. The companion code `SOL-O001` (ERROR) fires when two obligations that share a write surface — a conflict edge in the graph — are nonetheless marked for the same parallel batch; together `SOL-O001` and `SOL-O005` keep the source partition and the execution partition tied.

`DEPENDS ON` edges lower to the **merge-order partial order** (a branch MUST be merged after the branches it depends on); the write-surface conflict graph is the proof that the packets' OWNED paths are pairwise disjoint. Together they make the decomposition's correctness — the property that makes parallel writes safe — re-derivable from the artifact alone rather than held in the lead's head.

## The COVERAGE gate (pre-`implement`)

`decompose` is the carrier (manual today, tool-enforced later) of the **COVERAGE gate**, the checkpoint at the `LOWER → EXECUTE` boundary, after `decompose` emits packets and before any `implement` pass runs. A gate transforms nothing and writes no artifact: it is a precondition predicate over already-emitted state (the IR `nodes[]`/`edges[]` and the plan `packets[]`).

> **R-COVERAGE-GATE.** Before `implement`, for the lowered spec:
> 1. **Total coverage.** Every lowered obligation node (`REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE`, including each `AND THE`-split sub-obligation) is assigned to **exactly one `implement` packet** — none unassigned (uncovered), none assigned to two `implement` packets (double-owned). (An obligation legitimately recurs across its `implement`, `verify`, and `review` packets; the coverage count is *per `implement` packet*.)
> 2. **No orphan targets.** Every `verified_by` edge and every TRACE `implements`/`preserves` edge resolves to a real obligation node id present in `nodes[]`. A TRACE/VERDICT whose target id does not resolve is an orphan and MUST NOT be admitted.

The gate aggregates three existing codes:

| Condition | Code | Layer | Status | Resolves by |
|---|---|---|---|---|
| Obligation covered by no packet | `SOL-O007` (uncovered obligation) | ORCHESTRATION | **BLOCKING** | `SCOPE` — assign to a packet, or record as an explicit non-goal |
| Obligation assigned to two `implement` packets | `SOL-O008` (double-owned obligation) | ORCHESTRATION | **BLOCKING** | re-assign to exactly one packet |
| TRACE/VERDICT target id absent from `nodes[]` | `SOL-M003` (unbound-cross-reference) | SEMANTIC (surfaced at `review`) | — | bind the reference to a real node |

```text
COVERAGE gate (manual today, tool-enforced later):
  for each node N in IR.nodes where N.kind ∈ {REQ, CONSTRAINT, INVARIANT, INTERFACE} (incl. AND THE-split sub-obligations):
      count = | { p in plan.packets : p.pass == "implement" ∧ N.id in p.inputs } |
      count == 0  -> SOL-O007  (uncovered obligation)        [BLOCKING]
      count > 1   -> SOL-O008  (double-owned obligation)     [BLOCKING]
  for each verified_by / implements / preserves edge E:
      E.to NOT in IR.nodes  -> orphan target (SOL-M003 unbound-cross-reference, at review)
```

The COVERAGE gate is the **structural complement of distillation-loss**: distillation-loss forbids *dropping* an obligation during lowering; the COVERAGE gate forbids *stranding* one afterward. Together they make the lowered work a **bijection over obligations** — nothing lost in lowering, nothing left uncovered or pointed at a phantom.

## Worked fragment

For the `auth-refresh` spec (one `INTERFACE`, one `REQ` depending on it, one `INVARIANT`), a conformant plan groups the work into three packets:

- **WP-001** (`implement` the interface contract, `writes: api.auth.contract`, `batch: 0`) is **`merge_safe: false`** — it freezes a shared interface contract, so consumers serialize behind it.
- **WP-002** (`implement`, depends on WP-001, `writes: web.http.client`, `reads: api.auth.contract`, `batch: 1`) is **`merge_safe: true`** — write-disjoint from its batch-mates and depending only on a completed prior batch.
- **WP-003** (`verify`, depends on WP-002, `writes: web.http.tests`, `batch: 2`) is **`merge_safe: true`** for the same reasons.

The two `depends_on` packet arrays are mirrored as `depends_on` edges in `edges[]`, so the merge order is computable from the graph rather than read off the packet scalars.

## Conformance

A document is a conformant SOL/0.1 plan iff it: (1) has exactly the four top-level keys; (2) populates every required field (defaulting optional fields); (3) carries **no `locks` field anywhere**; (4) uses only the closed 9-pass set in `packets[].pass` and the closed edge-type set in `edges[]`; (5) represents inter-packet relationships **once**, as edges; (6) keeps the three version fields distinct. The plan schema is documented data only — no running emitter or scheduler ships.

## What `decompose` does and does not fix

`decompose` fixes the **partition contract**, not the partitioning *strategy*. What is fixed here: the scope vocabulary, the two derived graphs, the safe-parallelism predicate (verbatim and non-weakenable), the OWNED ⊆ WRITES lowering tie and its `SOL-O005`/`SOL-O001` codes, the COVERAGE gate, and the plan/work-packet shape.

What is **not** fixed here:

- The decomposition *heuristic* — how a Lead Engineer partitions a given obligation graph into the smallest set of write-disjoint packets — is a pass-guide / profile concern (`../templates/task.md`), not a kernel rule; the kernel fixes only the predicate the partition must satisfy.
- How a launcher chooses `lane`, `batch`, and `max_parallel` values, and any live scheduling/replanning over the plan — explicitly a launcher concern, outside the kernel.
- The IR construction `decompose` consumes (node ids, typed edges, `verify_by` normalization, `AND THE` chaining, the two derived graphs as emitted) belongs to `` `./lower.md` ``; the per-obligation scope clauses and the SURFACE grammar belong to the SOL language (`../language/SOL.md`). This file consumes both and partitions over them.

## Related

- `./lower.md` — the other `LOWER`-phase pass: builds the IR obligation graph (node-id assignment, typed-edge construction, `verify_by` normalization, `AND THE` chaining) that `decompose` partitions into packets.
- `./implement.md` — consumes each `task.md` work packet; the COVERAGE gate here is its precondition.
- `./lint.md` — the orchestration lint codes (`SOL-O001`, `SOL-O005`, `SOL-O007`, `SOL-O008`) and the semantic `SOL-M003` surfaced at `review`.
- `./review.md` — where `SOL-M003` unbound-cross-reference orphans surface.
- `../language/SOL.md` — the surface syntax for the scope clauses (`WRITES`/`READS`/`DEPENDS ON`/`AFFECTS`/`OWNED BY`) and the `SURFACE` declaration grammar.
- `../skills/pass-decompose-spec/SKILL.md` — the dedicated stdlib pass guide for `decompose`.
- `../skills/persona-lead-engineer/SKILL.md` — the carrier-profile stance for the `decompose` pass; the decomposition *heuristic* (how to partition an obligation graph into the smallest set of write-disjoint packets) is a profile concern, while the kernel fixes only the predicate the partition must satisfy.
- `../skills/distillation-discipline/SKILL.md` — the distillation-loss discipline the two `LOWER` passes are bound by.
- `../templates/spec.swarm.md` — the surface spec whose obligations the IR and plan derive from.
- `../templates/task.md` — the work-packet contract each packet is lowered into.
