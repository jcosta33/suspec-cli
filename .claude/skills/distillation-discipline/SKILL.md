---
name: distillation-discipline
type: fragment
pass: [lower, decompose, promote]
description: >-
  Record what a boundary crossing dropped, so a reviewer confirms nothing binding was lost. ALWAYS
  apply when a `lower`/`decompose`/`promote` pass moves obligations across an artifact boundary
  (spec→task, research/audit/bug-report→spec, task→finding), even a trivial copy. Do not finalize
  while a MUST-survive item is dropped without justification, the loss statement claims "nothing
  dropped", or a stance change (observation→intent) crossed silently. Skip same-modality edits
  crossing no boundary: a spec improved in place, a `verify`/`review` verdict, `lint` naming
  defects.
---

# Pass guide: distillation-discipline (cross-cutting fragment)

> **Fragment, not a standalone pass guide.** `distillation-discipline` is a cross-cutting
> fragment: a pass-guide-shaped module that other guides *compose*, not one a `task_kind`
> names directly. It is shared behind the three passes that cross an artifact boundary — `lower`,
> `decompose`, `promote`. A pass guide for one of those loads it; a `task.md` does not
> activate it on its own.
>
> **This fragment owns no semantics.** It does not define modality, authority order,
> verification semantics, the MAY-drop list, the MUST-survive list, the per-boundary matrix, the
> discipline-not-gatekeeper rule, the forbidden-composition treatment, or any lint code — those are
> owned by the SOL reference and the distillation-loss budget in
> the `lower` pass. Every load-bearing term below is cited to its owning reference,
> not redefined; the citation is non-authoritative delivery, and where this fragment and that
> reference disagree, **the reference governs.** This fragment is the *procedure* for applying the
> loss budget those layers own.

## Purpose

Information loses detail every time it crosses a pipeline boundary — most acutely at the **spec →
task lowering boundary** (the `lower` pass) and the **promotion boundary**
(the `promote` pass). Compression is the point;
*silent* compression is the hazard. A distillation that drops an obligation, its modality, or its
verification binding has not compressed the spec — it has **changed what gets built**
(the `lower` pass, Rationale). Compression that changes the build is not compression.

This fragment carries the *procedure* for distilling accountably: before a crossing is complete, the
agent makes the loss **visible** so a reviewer can read source and target side by side and confirm
nothing binding went missing. The visibility surface is the **`Preserved / Dropped /
Still-uncertain`** statement, which the loss budget (the `lower` pass) names as the
human-authored declaration that lint (`SOL-V001` / `SOL-M…`, the SOL error catalogue)
and source authority (`SOL-M004`, the SOL error catalogue) check against. The statement
does not *enforce* the budget — a model judging whether to allow a passage is soft control that can
be talked past. It *records* the loss so the deterministic checks have something to compare
against the typed obligation set.

## Consumes

- The higher-verbosity **source artifact** being distilled, load-bearing items still intact: a
  `research.md`, `audit.md`, `bug-report.md`, approved `spec.swarm.md`, `finding.md`, `task.md`, or
  trace — whichever the composing pass reads.
- The **loss budget** (the `lower` pass) as governing reference: the MAY-drop list,
  the MUST-survive list, and the per-boundary matrix row for the crossing in hand. The budget differs
  per boundary; this fragment reads the matching row, it does not author the matrix.
- The composing pass's own contract (`lower`, `decompose`, or `promote`), which fixes the target
  artifact and the obligation / discovery set in scope.

## Produces

No artifact of its own. The fragment contributes a **`Preserved / Dropped / Still-uncertain`**
statement to the target artifact the composing pass produces, plus the visible per-item check
(step 4) that backs it — the procedure the composing pass runs *while* producing its artifact, not a
separate output. It defines no new block, modal, status value, or lint code.

## Preserves

Everything the loss budget marks MUST-survive crosses the boundary intact; this fragment never
authorizes dropping any of it. The MUST-survive categories to confirm (the budget is
the `lower` pass's, not this guide's):

- The **obligation itself** (its ID) — the backward-trace key; losing it severs the trace.
- Its **modality** (`MUST` / `MUST NOT` / `SHOULD` / `SHOULD NOT` / `MAY`) — modality *is* the
  binding force (the SOL reference); losing it neutralizes the obligation.
- Its **verification bindings** (`VERIFY BY …`) — an obligation with no proof path is `UNVERIFIED`
  (the `verify` pass).
- Its **authority and scope** — the domain / artifact rank and the `WRITES` / `READS` /
  `AFFECTS` scope (the SOL reference).
- **Constraints, invariants, non-goals, and unresolved `QUESTION`s** — these bound the build;
  dropping a non-goal silently widens scope.

## Rejects

These are distillation errors, not stylistic choices — halt, do not finalize:

- A **`Preserved / Dropped / Still-uncertain` statement that says "nothing was dropped."** If nothing
  dropped, the crossing was a copy, not a distillation — embrace the copy and omit the statement, or
  distil and record the real loss.
- A statement listing **categories without specifics** ("dropped: implementation details"). A
  reviewer cannot audit a category. Specific: "dropped: the comparison of three retry strategies; the
  chosen one is recorded as `C-014`."
- **Silent dropping of any MUST-survive item.** Lint surfaces this as `SOL-V001` / `SOL-M…`
  (the SOL error catalogue) and a contradicting distillation as `SOL-M004`
  (the SOL error catalogue) — this fragment never extends or
  overrides that list.
- A **forbidden composition**: letting an observation-only artifact silently become intent
  (an `audit.md` read as an approved spec, a `research.md` treated as a decision, a `bug-report.md`
  treated as a fix authorization). The fragment forces an explicit re-statement; it does not
  adjudicate authority — source authority does (approved spec / ADR outranks task, which outranks
  chat), and a distilled artifact contradicting its higher-authority source is a `SOL-M004`
  (the SOL error catalogue) routed to amendment, not something this fragment overrides.
- A statement appended **after the fact** without re-running the per-item check below. A loss
  statement written from memory is fiction; it must be backed by the check it summarizes.

## Procedure

1. **Identify the boundary and pull its matrix row.** Name the crossing (e.g.
   `spec.swarm.md → task`, `audit.md → spec.swarm.md`, `task.md → finding.md`). Read the matching
   row of the per-boundary matrix (the `lower` pass) for the *permitted loss* and
   *forbidden loss* for exactly this
   crossing. **Do not generalize one row to another:** `spec → task` permits dropping only
   rationale-not-needed-for-execution; `research → spec` permits dropping rejected options and
   digressions — the columns differ, and applying the wrong row is how a binding constraint leaks
   out.

2. **Enumerate the source's load-bearing items.** From the source, list every MUST-survive
   item present here: each obligation ID, its modality, its `VERIFY BY` bindings, its authority and
   scope, and every constraint, invariant, non-goal, and unresolved `QUESTION` in range. An item you
   never enumerate is one you cannot notice dropping.

3. **Classify each item as it lands in the target.** Record one disposition per item:
   - **preserved** — survives in the target in some form (a requirement, a behavioural constraint, or
     a structural choice that enforces it).
   - **promoted to `<target>`** — moved *upstream* rather than dropped (a discovery routed by the
     discovery-to-target table in the `promote` pass; see *the sister discipline*
     below).
   - **dropped (justified)** — legitimate *only* for MAY-drop items or the *permitted loss*
     column of this boundary's matrix row; record where it survives instead (the linked source, the
     canonical statement, the ADR / finding / research it came from).
   - A MUST-survive item marked dropped is a **distillation error** — return to step 2 and either
     carry it across or, if the matrix row permits deferral, mark it explicitly deferred to a named
     downstream artifact. Never leave it implicit.

4. **Emit the visible per-item check (forced output — hard gate).** Output one row per item so the
   classification is **auditable, not asserted**. The crossing is not complete until this table
   appears in the target's working notes with every MUST-survive item shown `preserved` or
   `promoted to <target>`. A MUST-survive item shown `dropped` without justification is a gate
   failure: halt and revise before the composing pass finalizes its artifact. An asserted "nothing
   was lost" with no table is the silent-compression failure this fragment exists to close.

   | Source item | Disposition | Survives as / why droppable |
   | ----------- | ----------- | --------------------------- |
   | `<obligation ID + modality, or other MUST-survive item>` | preserved / promoted to `<target>` / dropped (justified) | `<where it lands, or the MAY-drop / matrix-row justification>` |

5. **Write the `Preserved / Dropped / Still-uncertain` statement** into the target artifact — the
   declaration the loss budget (the `lower` pass) names; keep it real and complete:
   - **Preserved** — the load-bearing items carried across (named concretely, not "all obligations").
   - **Dropped** — each dropped item in concrete terms, with where it survives instead (the MAY-drop
     list, the `lower` pass) or the
     matrix-row clause that permits it.
   - **Still-uncertain** — anything left open for the next stage rather than guessed (an unresolved
     `QUESTION` carried forward, a decision deferred). Lowering past an unresolved *blocking*
     `QUESTION` commits a guess as an obligation — leave it visible here; do not silently resolve it.

6. **Check for a forbidden composition.** If the crossing changes the artifact's epistemic
   stance — observation → intent, exploration → decision, diagnosis → authorization — confirm it is
   an explicit authoring re-statement (the source item becomes a target obligation with its own ID,
   modality, and `VERIFY BY`), not a silent re-read. If the target appears to contradict a
   higher-authority source, that is a `SOL-M004` (the SOL error catalogue) for source
   authority to resolve, not something this fragment overrides.

7. **Do not finalize until every per-item row is justified.** The composing pass MUST NOT treat the
   crossing as complete while any MUST-survive row is dropped-without-justification or any forbidden
   composition is unresolved. Halt and revise; only then hand the target to the composing pass for
   its own output contract.

## Output contract

- The target artifact carries a complete **`Preserved / Dropped / Still-uncertain`** statement whose
  three parts are specific — no "nothing dropped", no bare category names.
- The per-item check (step 4) exists and shows every MUST-survive item from the source as
  `preserved` or `promoted to <target>`; no MUST-survive item is `dropped`.
- Every `dropped (justified)` row cites where the item survives (the MAY-drop list,
  the `lower` pass) or the matrix-row clause that
  permits the loss for *this* boundary.
- No epistemic stance crossed silently; any stance change is a recorded re-statement, and any
  apparent contradiction with a higher-authority source is left to the `SOL-M004`
  (the SOL error catalogue) authority path.

## Self-review delta

When this fragment is composed into a pass, the pass's self-review additionally confirms, before the
crossing is done:

- Did I pull the **correct per-boundary matrix row** (the `lower` pass) for *this*
  crossing, not a generic budget? The permitted-loss columns differ per boundary.
- Is every **obligation ID, modality, `VERIFY BY` binding, authority, scope, constraint, invariant,
  non-goal, and unresolved `QUESTION`** from the source accounted for in the per-item check as
  `preserved` or `promoted`?
- Does the `Dropped` list name **concrete items with where they survive**, never categories?
- Did I avoid inventing semantic meaning? This guide cites the loss budget
  (the `lower` pass), source authority, proof (the `verify` pass),
  and scope (the SOL reference) for those rules — it defines none. If I found myself
  *deciding* what a modal means, what outranks what, or what counts as valid proof, I overstepped;
  that is SOL / IR and the reference layer, not this fragment.
- For a stance-crossing boundary, is the crossing an **explicit re-statement**, not a silent
  promotion of observation to intent?

## Anti-patterns

An agent (or user) reasoning toward one of these should write the per-item check (step 4) and the
real loss statement — the point is to make skipping accountability a visible exchange.

| 🚩 Anti-pattern | Correction |
| --------------- | ---------- |
| "Nothing was dropped, so I'll write 'nothing dropped' and move on." | If truly nothing dropped it was a copy, not a distillation — omit the statement entirely, or distil and record the *real* loss (the MUST-survive list, the `lower` pass). |
| "I'll just say 'dropped: implementation details / narrative.'" | A category is not auditable. Name the concrete item and where it survives — "dropped: the three-retry-strategy comparison; chosen one is `C-014` in the research file" (the MAY-drop list, the `lower` pass). |
| "This obligation's rationale isn't needed downstream, so I'll drop the whole obligation." | Rationale is MAY-drop; the obligation ID, modality, and `VERIFY BY` are MUST-survive (the `lower` pass). Drop the rationale, carry the binding. |
| "The audit clearly says we accept rotated tokens — I'll lower it straight into a task." | An `audit.md` is observation (Axis-A rank 4), not intent. It must promote into a spec as a re-stated `CONSTRAINT` with its own ID, modality, and `VERIFY BY` before it can bind (forbidden composition, the `lower` pass); a silent read is a forbidden composition. |
| "I'll write the loss statement at the end from memory." | A statement not backed by the per-item check is fiction. Run step 4 first, then summarize it (step 5). |
| "There's an unresolved `QUESTION`, but the answer's obvious — I'll just lower it." | Lowering past a blocking `QUESTION` commits a guess as an obligation. Carry it into `Still-uncertain`; do not resolve it silently (the `lower` pass). |
| "This item didn't make it across, but it's not really dropped." | Every MUST-survive item is `preserved`, `promoted to <target>`, or `dropped (justified)` — there is no fourth, implicit state. Pick one in writing. |

## The sister discipline: promotion (the upward direction)

Distillation flows downhill; **promotion** flows up. When a task discovers something durable, the
finding is promoted *upstream* (the `promote` pass) rather than silently dropped —
routed to its target by the
discovery-to-target table and resolved to one of the seven promotion statuses before the task
closes (the `promote` pass). "Keep in the task only" is itself a recorded
disposition (`rejected`, reason
"execution-local"), not an omission. This is why step 3 admits **promoted to `<target>`** as a
first-class disposition: a load-bearing item not carried *across* a downhill boundary may instead be
promoted *up* one — what it must never do is vanish. The `promote` pass owns that routing; this
fragment only marks the item as promoted rather than dropped.

## Bundled resources

- [`references/worked-example.md`](./references/worked-example.md) — a full `research.md →
  spec.swarm.md` walk-through applying this procedure, with the per-item check (step 4) and the
  resulting `Preserved / Dropped / Still-uncertain` statement (step 5).
