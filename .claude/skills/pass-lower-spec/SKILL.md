---
type: pass-guide
name: pass-lower-spec
pass: lower
description: >-
  Run the `lower` pass: transform an improved `spec.swarm.md` into the typed obligation IR — nodes over
  the 7 block types, relationships as edges only, every node source-mapped, lossless for binding content.
  ALWAYS apply when a task names the `lower` pass, a spec must become the machine-checkable IR, or a
  downstream pass needs the obligation graph. Never lower past an unresolved blocking QUESTION, drop an
  obligation/modality/binding, encode a relationship as a node scalar, or invent a node kind / edge type
  outside the closed sets. Skip detecting/repairing defects (`lint`/`improve`), partitioning into work
  packets (`decompose`), or authoring (`author`).
---

# Pass guide: lower

How to run the `lower` pass. **SOFT control** — procedure, not meaning. The IR shape, the 7 edge types,
and the lowering contract are fixed by `reference/ir.md`; this guide applies them.

## Purpose
`lower` derives the **typed obligation IR** — the machine-checkable form of the same content the spec
states in prose. Every later pass reasons over the IR (`decompose` plans from it, `verify`/`review` judge
against it). Lowering is a faithful re-expression, not a rewrite: it adds no intent and drops no binding.

## Consumes
- The improved `spec.swarm.md` (lint-clean, no blocking `QUESTION`).
- `reference/ir.md` (the IR document shape, the 7 edge types, the lowering contract) and `reference/sol.md`
  (the surface forms being lowered).

## Produces
- `<spec>.swarm.ir.json`: `{ meta, nodes[], edges[], diagnostics[], provenance }` — one node per SOL block,
  relationships in `edges[]`, every node source-mapped, lossless for binding content.

## Procedure
1. **Gate first.** If any in-scope obligation is affected by a `[blocking]` QUESTION, **do not lower it** —
   a blocking question reaching `lower` is `SOL-O003` (an unresolved decision compiled into the graph).
2. **One node per block.** Emit a node per SOL block with `kind` from the 7 closed types; lower keyword
   clauses to `snake_case` fields (`VERIFY BY`→`verify_by[]`, `WRITES/READS/TOUCHES`→ the scope sets,
   `RISK`/`DOMAIN`→ fields). Split each `THE …`/`AND THE …` consequence into a **separate** node carrying
   the same conditions and the same `verify_by`.
3. **Relationships as edges only.** `DEPENDS ON`/`AFFECTS` and the derived `conflicts_with`/`verified_by`/
   `implements`/`preserves`/`blocks` go in `edges[]` (`{from,to,type,hard}`), drawn from the 7 closed edge
   types — **never** as a scalar field on a node. Derive `conflicts_with`/`affects` from shared scope sets
   (two nodes sharing a write surface → a `conflicts_with` edge), keeping the raw declaration on the node.
4. **Source-map every node.** `source = {file, line_start, line_end, content_hash}` — the basis for
   staleness/drift.
5. **Preserve binding content (the loss budget).** Every obligation, modality, and `VERIFY BY` binding in
   the source MUST be recoverable from the IR. Permitted drops are only non-binding (rationale, source
   digressions recorded elsewhere); a dropped obligation/modality/binding is a distillation-loss defect
   (see the `distillation-discipline` skill).
6. **Stay in the closed sets.** No node `kind`, edge `type`, or modal outside Swarm's closed sets —
   inventing one forks the language.

## Anti-patterns
- ❌ Lowering an obligation an open `[blocking]` QUESTION affects → `SOL-O003`; resolve it first.
- ❌ A `depends_on`/`affects` scalar on a node → relationships live only in `edges[]`.
- ❌ Collapsing an `AND THE` chain into one node → each consequence is its own obligation.
- ❌ A node with no `source`/`content_hash` → drift detection can't see it.
- ❌ Dropping a binding to "simplify" the graph → lowering is lossless for binding content.

## Self-review
- One node per block (and per chained consequence), each `kind` in the closed set?
- Every relationship in `edges[]`, none as a node scalar, every edge type closed?
- Every node source-mapped with a content hash?
- Every source obligation/modality/binding recoverable from the IR?
- No in-scope obligation lowered while a blocking QUESTION affects it?

## Related
- IR shape, edges, lowering contract — `reference/ir.md`. Surface forms — `reference/sol.md`.
- The loss discipline — `distillation-discipline`. The downstream partition — `pass-decompose-spec`.
