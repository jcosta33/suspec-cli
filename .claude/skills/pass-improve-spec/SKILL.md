---
type: pass-guide
name: pass-improve-spec
pass: improve
description: >-
  Run the `improve` pass: apply the ten closed, strictly semantics-preserving operations that repair the
  defects `lint` named, clearing the codes without changing intent. ALWAYS apply when a task names the
  `improve` pass, a lint report's codes must be repaired, or a spec must be normalized before `lower`.
  Never change an obligation's actor/trigger/modality/response set (that is authoring, not improve),
  invent an operation outside the ten, drop an obligation or binding, or resolve a blocking QUESTION by
  guessing. Skip detecting defects (`lint`), authoring new intent (`author`), or building the structured form (`lower`).
---

# Step guide: improve

How to run the `improve` step. **SOFT control** — procedure, not meaning. It owns no semantics: the lint
codes, the improve-operation set, and what counts as intent-changing are fixed by the SOL reference
(`reference/sol.md`) and the lint catalogue (`pass-lint-spec/references/code-catalogue.md`); this guide
applies them.

## Purpose
`lint` *names* defects (and the repair op in each `suggest`); `improve` *applies* the repair. The one
invariant (R-IMPROVE): **improve is strictly intent-preserving.** It repairs *form* — never the actor,
trigger, modality, or the union of responses an obligation requires. If a change would alter what the
obligation means, that is an `author` amendment, not an improve.

## Consumes
- The `spec.swarm.md` and the `lint` report (the `{code, severity, layer, span, suggest}` records).
- `reference/sol.md` (the surface grammar the repairs must stay within).

## Produces
- The repaired `spec.swarm.md` with every BLOCKING lint code cleared and no blocking `QUESTION` left, each
  edit traceable to the op that made it. No obligation, modality, or binding dropped (no distillation loss).

## The ten operations (closed; each clears a code class)
In spec order: `NORMALIZE  ATOMIZE  CONCRETIZE  QUANTIFY  BIND  SCOPE  CLARIFY  DECONFLICT  COMPRESS  PROMOTE`.

1. **NORMALIZE** (`SOL-P003`, `SOL-V###`) — an informal/lowercase modal or non-canonical clause order →
   an approved uppercase modal in canonical clause order. Form only; **no meaning changed** (do NOT resolve
   an undecided `SHOULD` to `MUST`/`MAY` here — that is intent; raise a QUESTION).
2. **ATOMIZE** (`SOL-P004`) — split one block that bundles ≥2 separable obligations into one block each,
   each with its own id and its bindings distributed; re-grade per-child `RISK` (metadata, not intent).
3. **CONCRETIZE** (`SOL-P005`) — replace a vague-quality word with observable behavior (actor + action +
   object) on the same line.
4. **QUANTIFY** (`SOL-P005`) — replace an unbounded quality with a measurable threshold or named criterion.
   (3 and 4 share `SOL-P005`; pick by whether the repair is qualitative or quantitative.)
5. **BIND** (`SOL-V001`, `SOL-V###`) — attach a valid `VERIFY BY <type>:<adapter>:<artifact>` (and any
   missing source/interface/trace reference). An INVARIANT prefers `property`/`model`/`static`; an
   INTERFACE requires `contract`.
6. **SCOPE** (`SOL-O###`) — add the spec's missing **declarations**: non-goals, applicability, `WRITES`
   surfaces, or exclusions (it makes scope explicit; it does not move or serialize obligations).
7. **CLARIFY** (`SOL-P008`) — lift a buried prose ambiguity into an explicit interpretation **or** a
   `QUESTION` block. Do **not** answer a blocking QUESTION by guessing — it is resolved out-of-band.
8. **DECONFLICT** (`SOL-M002`) — two obligations (or an obligation vs a higher artifact) contradict →
   resolve per source authority (record it), or raise to amendment; never delete one silently.
9. **COMPRESS** (`SOL-P054`, `SOL-P055`) — remove non-load-bearing noise / redundancy and stabilize
   phrasing, **without** dropping any obligation, modality, or binding.
10. **PROMOTE** (the promotion protocol) — move a durable fact out of task-local state to its home
    (`finding.md`/`spec.swarm.md`/`adr.md`/memory) with provenance, leaving the obligation lean.

## Procedure
1. For each BLOCKING code in the report, read its `suggest` op (the code→op map is in
   `pass-lint-spec/references/code-catalogue.md`). Apply that op, and only that op, to the named span.
2. After each edit, confirm intent is preserved: the actor, trigger, modality, and the union of responses
   are unchanged; only form moved. If you cannot repair without changing meaning, stop and route to
   `author` (an amendment) — do not smuggle intent through improve.
3. Resolve every blocking `QUESTION` out-of-band (record the decision); remove the resolved question.
4. Re-run `lint` (or re-check by hand) — every BLOCKING code clears and no blocking `QUESTION` remains.
5. Confirm no obligation/modality/binding was dropped (no distillation loss).

## Anti-patterns
- ❌ Rewording a `SHOULD` to `MUST` when the owner has not decided → that changes intent; raise a QUESTION.
- ❌ "Tidying" prose that drops or merges an obligation → COMPRESS removes redundancy, never content.
- ❌ Answering a `[blocking]` QUESTION yourself → it is resolved out-of-band; CLARIFY only surfaces it.
- ❌ Inventing an op outside the ten, or applying a `suggest` op to the wrong span.
- ❌ Splitting a spec into work packets under the banner of `ATOMIZE` → that is the separate `decompose`
  *pass* (R-DECOMPOSE-NOT-IMPROVE); `ATOMIZE` only splits a bundled obligation *within the same spec*.
- ❌ Running `improve` with no lint findings to answer → it is a no-op; `improve` runs only after `lint`.

## Self-review
- Did every BLOCKING code clear, with each edit traceable to one of the ten ops?
- Is every obligation's actor/trigger/modality/response set byte-for-byte intent-equivalent?
- Are all blocking QUESTIONs resolved-and-removed, none guessed?
- Was anything dropped that should have been promoted instead?

## Related
- The `lint` step (names the defects this repairs) — `pass-lint-spec`.
- The loss discipline — `distillation-discipline`.
- Surface grammar — `reference/sol.md`. Code catalogue — `pass-lint-spec/references/code-catalogue.md`.
