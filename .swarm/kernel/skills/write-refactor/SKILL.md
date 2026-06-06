---
type: pass-guide
name: write-refactor
pass: implement
activates_for_task_kind:
  - refactor
description: >-
  Restructure code on an `implement`/`task_kind: refactor` packet, preserving observable behaviour
  via an equivalence check that fails on drift. ALWAYS apply when a `task.md` has `pass:
  implement` + `task_kind: refactor`, or the user asks to refactor, restructure, clean up,
  extract, or address an audit's "Needed" items — only while behaviour holds. Never change
  behaviour, bulk-codemod, delete a symbol without grep proof, or leave a shim lacking a
  removable-when criterion. Skip behaviour-changing rewrites, API/framework migrations or version
  upgrades, perf tuning, and net-new feature work.
---

# Pass guide: implement — refactor

## Purpose

Restructure code internals so it reads, factors, or layers better, **without
moving any observable behaviour**. A refactor fails in exactly two ways: a
behaviour delta smuggled in under the "purely internal" label, and a
compatibility shim that quietly becomes permanent. Keep the change structural
and give every shim a documented exit.

The defining test: if any observable behaviour moves, the work is no longer a
refactor — it is a `rewrite` (behaviour deliberately changes) or a `migration`
(API A → API B). Relabel the task and load the matching discipline; do not
proceed under `refactor`.

This guide is SOFT control (Invariant 2): it tells you *how* to run the pass, not
modality, authority order, verification semantics, verdict values, or the proof
taxonomy — those are owned only by SOL and the IR. Where this guide and the spec
disagree, the spec governs.

## Stance: Janitor

Adopt the Janitor stance: leave the codebase cleaner than you found it and touch
nothing you were not asked to touch. The Janitor is hostile to behavioural drift
and allergic to "while I'm here" changes — every edit serves an assigned
restructuring obligation or it does not happen. A stance sharpens *what you look
for and refuse*; it never changes the procedure or decides a verdict.

## Consumes

- One `task.md` — the lowered packet for this pass. `implement` works against the
  packet `decompose` handed it, **not** the surface spec or the IR. Read in
  particular: `assigned_obligations`, `constraints`, `invariants`, `interfaces`
  (the SOL blocks pasted verbatim that fix scope); `write_surfaces` (your owned
  paths, the only files you may touch); `verification_bindings` (the proofs each
  obligation demands); and `task_kind`, which must read `refactor` for this guide
  to apply.
- The driving audit, when one exists — a refactor is typically driven by an
  audit's prioritised "Needed" items. Read it in full before editing.
- Project command slots resolved via the consuming repo's `AGENTS.md > Commands`:
  `cmdTest`, `cmdValidate`, and the architectural/dependency-validation command
  used at the every-N-files checkpoint (often a `cmdValidate`-adjacent slot such
  as a dep-cruiser; not a fixed contract slot). **If `AGENTS.md` is missing or a
  slot is undefined, ask the user which command to run — never guess.**

## Produces

- Code/test changes within the declared write surfaces, and only there.
- A `trace.md` recording one `TRACE` block per assigned obligation —
  `IMPLEMENTS` the `REQ` ids satisfied, `PRESERVES` the `CONSTRAINT`/`INVARIANT`
  ids held, `CHANGED` the modified surfaces, and at least one `PROOF` line with
  pasted, re-runnable output. Its `## Provenance` section carries the per-binding
  drift fields the staleness join depends on. Externalising the run's work into
  this durable artifact (not leaving it in context) is what lets the downstream
  `verify` and `review` passes judge it.

## Preserves

- **Observable behaviour, end to end.** The obligation a refactor exists to
  honour — see rule 1. Constraints, invariants, and non-goals are held, not
  relaxed; changing an obligation's intent is an amendment decision at `improve`,
  never an `implement` action.
- **Only the assigned obligations.** Any change not traceable to an assigned
  obligation is an `## Unassigned changes` row in the trace (reason + authorizing
  ID, or `none`), judged at `review`.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the
  union of the assigned obligations' `WRITES` surfaces. A path outside any
  assigned obligation's declared write surface is the owned-path defect `SOL-O005`
  ("owned path outside declared write surface") — the property that keeps
  parallel `implement` packets write-disjoint.

## Core rules

### 1. Behaviour preservation is proven by an equivalence check, not by a green suite

Pick the strongest available oracle that **would fail if behaviour changed**:
property-based, differential (keep the pre-refactor path reachable behind a shim
and diff the two until clean), or golden-output pinning existing behaviour before
the change. A green suite that never asserted the preserved behaviour is
*necessary but not sufficient* — it covers only what was already tested, so a
behaviour delta in an untested corner passes silently. Where no stronger oracle
exists, record in the self-review *why* the suite is a sufficient oracle for this
change (e.g. exhaustive named-test coverage of the touched surface, shown). Run
`cmdTest` before, at every checkpoint, and after; if a test fails after a
refactor the refactor changed behaviour — investigate before "fixing" the test,
because adapting a test to a new result is how a rewrite disguises itself as a
refactor.

### 2. Run the architectural check at the checkpoint frequency, not only at the end

Run the project's architectural/dependency-validation command after every batch
(every ~10 files, or the audit's chosen frequency), not only at close.
Per-checkpoint validation catches a layering or dependency violation while it is
one file old and cheap to undo; final-only validation lets drift accumulate into
a tangle you cannot bisect.

### 3. Each file modified individually — no bulk codemods

No `sed`/codemod sweeping hundreds of files in one commit. Bulk operations hide
the one context-specific callsite that does not fit the pattern — exactly the
deviation a refactor must not introduce. Read, change, and review each file
deliberately.

### 4. Document every shim with a verifiable removable-when criterion

Before introducing any compatibility shim, record three things: its **path**
(where it lives), its **forward target** (what it forwards to), and a
**removable-when criterion** that is mechanically verifiable (e.g.
`git grep -c '<old-API>' src/` returns 0). A shim with no removal criterion is
permanent by default, and permanent shims accrete as the architectural debt a
refactor was supposed to reduce.

### 5. Prove deletion safety with pasted search evidence

For every deleted symbol, paste into the self-review: `git grep -n '<symbol>'
src/ tests/` showing zero callers, **and** a separate search for the symbol's
*string form* (dynamic dispatch, registries, reflection, generated code,
config) — a search of the call syntax cannot reach those. Deletion without pasted
search evidence is unsafe; "I checked, it's unused" is not a proof.

### 6. Promote out-of-scope findings — never fix them inline

Anything you discover that is not on the assigned obligations / audit list gets a
`## Promotion queue` row with a target and status, not a silent fix. "While I'm
here" cleanup dilutes the review surface and re-introduces the behaviour-drift
risk this discipline exists to remove. All promotion items MUST be resolved
before the task closes.

### 7. Forced visible output: paste it, don't assert it

Any otherwise-invisible verification step MUST produce pasted, verbatim output. A
`PROOF` line referencing real run output is admissible; an unqualified "tests
passed" or "validation clean" is not — a no-`PROOF` `TRACE` that claims
`IMPLEMENTS` is a structural parse error (`SOL-S014`), and an
`IMPLEMENTS`/`PRESERVES` naming an unknown obligation is the unbound
cross-reference `SOL-M003`. The observed `proof_result` (`passed | failed |
blocked | unverified`) is only the core run observation; the `PASS` decision is
made downstream by the profile-independent `verify` pass, and the lifecycle
decorators (the 7-value verdict's `WAIVED` / `STALE` / `CONTRADICTED`) are
applied later at `review` — never here.

## Procedure

1. **Read the packet and the audit, not the spec.** Read the full `task.md`
   (parent contract, In/Out scope, obligations verbatim, constraints/invariants)
   and the driving audit. Resolve project commands from `AGENTS.md > Commands`;
   ask the user for any undefined slot.
2. **Confirm the owned paths.** Verify `write_surfaces` is a subset of the
   assigned obligations' `WRITES` surfaces. If you need a file outside it, stop —
   that is `SOL-O005`; the file belongs to another packet, or the write surface
   needs amending upstream.
3. **Capture the equivalence oracle before touching code** (rule 1). Establish
   the characterization/differential/golden baseline pinning current behaviour;
   run `cmdTest` and confirm green. If no stronger oracle than the suite exists,
   note the sufficient-oracle justification now.
4. **Halt on ambiguity.** If an assigned obligation is unclear or contradictory,
   surface it — do not invent the requirement. Resolving it silently is an
   amendment you are not authorized to make at `implement`.
5. **Restructure in batches, one file at a time** (rule 3). After each batch run
   the architectural/dependency check and `cmdTest`; paste both outputs as you go
   (rule 2). Document each shim before introducing it (rule 4) and each deletion's
   search evidence (rule 5).
6. **Write the TRACE claims.** Per obligation: `IMPLEMENTS` / `PRESERVES` /
   `CHANGED` + at least one pasted `PROOF` line (rule 7). Record the
   `## Provenance` drift fields per binding.
7. **Resolve the promotion queue** (rule 6) — every out-of-scope discovery has a
   target + status; none left unresolved.
8. **Self-review** — see below; not done until every check is answered in writing
   with the evidence pasted.

## What does not belong

- **In a refactor:** new features, behavioural "improvements", "while I'm here"
  semantic changes, and surface-level API replacements — the last are migrations,
  a different discipline.
- **In the task's `## Findings`:** durable architectural concerns that were not
  promoted upstream to the audit.

## Anti-patterns

- ❌ Silencing a checkpoint validation failure by editing the validator config →
  fix the violation, not the gate.
- ❌ "While I'm here" semantic tweaks bundled into the structural change →
  promote them (rule 6).
- ❌ A bulk codemod / `sed` across hundreds of files in one commit → one file at
  a time (rule 3).
- ❌ Deleting a symbol on "looks unused" without pasted grep + string-form search
  → rule 5.
- ❌ Skipping the per-checkpoint validation and validating only at the end →
  rule 2.
- ❌ Refactoring tests "for clarity" alongside production code → tests are the
  oracle; changing them in the same pass removes the proof that behaviour held.
- ❌ A shim with no removable-when criterion → rule 4; that is permanent debt.
- ❌ Adapting a failing test to the new output and calling it green → that is a
  behaviour change; relabel the task as `rewrite` or revert (rule 1).

## Output contract

The `trace.md` and the filled `task.md` together satisfy the spec contracts;
this guide does not redefine them.

- The `trace.md` MUST carry: frontmatter (`type: trace`, `id`, `source_task`,
  `source_spec`, `created`); `## Claimed implementation` (the `TRACE` blocks);
  `## Provenance` (the per-binding drift fields); `## Verification matrix`
  (ID → required proof → actual proof → status); `## Unassigned changes` (each
  with reason + authorizing ID, or `none`); `## Promotion items` (target +
  status).
- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line
  (`SOL-S014` otherwise); an `IMPLEMENTS`/`PRESERVES` naming an unknown
  obligation is `SOL-M003`.
- `proof_result` maps 1:1 to the downstream core verdict (`passed → PASS`,
  `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`); the gate
  decision and lifecycle decorators are not made here (rule 7).

## Self-review

> **Hard gate.** The task is not complete until every question below has a
> written answer directly beneath it, with the named output pasted verbatim.
> Act as a senior engineer hostile to behavioural drift.

- **Verification outputs (paste actual command output — do not paraphrase):**
  `git status`; each per-checkpoint architectural/dependency-validation output;
  final architectural/dependency-validation (last 2 lines); `cmdTest` (last 2
  lines).
- **Behaviour preservation:** What is the equivalence oracle, and would it fail
  if behaviour changed? Are test results before and after identical? If any test
  changed, is the change mechanical (e.g. import paths) or behavioural drift? If
  the suite was the only oracle, is the sufficient-oracle justification recorded?
- **Architectural cleanliness:** Did validation pass at *every* checkpoint, or
  did issues accumulate to the end?
- **Shim hygiene:** Is every shim documented with a verifiable removable-when
  criterion?
- **Deletion safety:** For every deleted symbol, is the grep-for-callers output
  *and* the string-form/dynamic-dispatch search pasted?
- **Scope:** Did I touch only the assigned obligations and declared write
  surfaces? Anything that should have moved but didn't, or moved but shouldn't
  have? Did "while I'm here" creep in? Are all promotion items resolved?
- **Final adversarial pass:** What changed besides what I intended? What is now
  subtly different that the oracle does not cover? Do not close without this.

## Bundled resources

None. This guide's discipline lives entirely in the body; per-task working state
(plan, progress, shim contracts, pasted verification) is carried by the `task.md`
pass frame, not a separate template.
