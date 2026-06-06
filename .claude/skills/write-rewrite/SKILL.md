---
type: pass-guide
name: write-rewrite
pass: implement
activates_for_task_kind:
  - rewrite
description: >-
  Re-implement code whose behaviour changes on purpose, proving the delta and
  the preserved non-delta by equivalence check. ALWAYS apply when a
  `task.md` has `pass: implement` + `task_kind: rewrite`, or the user asks to
  rewrite a module, replace an implementation, or redo something wrong (even
  without "rewrite") when behaviour deliberately changes. Never start before the
  delta is recorded, let an unintended difference ship, or pass an emergent
  change without halting to amend the spec. Skip behaviour-preserving refactors,
  API/framework migrations, perf tuning, net-new features on fresh specs.
---

# Pass guide: implement — rewrite

> **This guide is SOFT control (Invariant 2).** It tells you *how* to run a
> `rewrite` implementation; it never defines verdict values, the proof taxonomy,
> modality, authority order, or any load-bearing meaning — those live only in SOL
> and the IR. Every load-bearing term below (the 7-value verdict, `proof_result`,
> the `SOL-O005` owned-path rule, the COVERAGE gate) is *delivered*, not redefined
> here. Where this guide and the spec disagree, the spec governs.

## Purpose

A rewrite is riskier than a refactor because behaviour is *permitted* to change
— so an unintended change hides exactly where an intended one is allowed. This
guide forces the change onto **two provable surfaces**: the **delta** (every
behaviour meant to change) and the **preserved non-delta** (everything else).
The delta is the contract; anything not on it must survive untouched.

The test against the neighbours: a `refactor` changes *no* observable behaviour,
so if your task moves none, relabel `refactor` and load that discipline. A
`migration` moves from API A to API B while the *contract* stays put; if the
observable behaviour holds and only the implementation API changes, it is a
`migration`. A `feature` adds capability that did not exist, against a fresh
spec; a rewrite re-implements something that already exists. Changing some
observable behaviour of an existing module on purpose is this discipline.

## Stance: Builder

Adopt the Builder stance: build exactly what the obligations specify, reuse
before you invent, let nothing leave your hand unproven. For a rewrite the
Builder is adversarial toward its own diff — hostile to the *un-asked-for*
difference, the "redesign while we're here" temptation, and the emergent change
that never made the delta table. A stance sharpens *what you build and refuse*;
it never changes the procedure or decides a verdict.

## Project context (the `cmd*` slots)

Resolve project commands through the consuming repo's `AGENTS.md > Commands`
slots: `cmdTest`, the aggregate `cmdValidate`, and `cmdFormat` where the change
touches docs or you close by formatting. If `AGENTS.md` is missing or a slot you
need is undefined, **ask the user** before proceeding — never guess, because a
guessed command produces a false proof.

## Consumes

- **One `task.md`** — the lowered work packet for this single pass, **not** the
  surface spec or the IR; `implement` works against the packet `decompose`
  handed it. Read: the assigned obligations pasted verbatim (the `REQ` /
  `CONSTRAINT` / `INVARIANT` / `INTERFACE` blocks that fix scope and encode which
  behaviours change and which are held); the `write_surfaces` (your owned paths,
  the only files you may touch); the `verification_bindings` (the proof each
  criterion demands); the `## Scope` In/Out list; and the `task_kind` enum, which
  must read `rewrite` for this guide to apply.
- The driving spec or audit, when one exists — a rewrite is typically prompted by
  an audit finding or revised spec. Read it in full before editing; the delta you
  record must trace to it, not to your judgement of what "should" change.
- The Builder stance the task names.

## Produces

- Code and tests within the declared write surfaces, implementing only the
  assigned obligations.
- A `trace.md` recording one `TRACE` block per assigned obligation —
  `IMPLEMENTS` the `REQ` ids the change satisfies, `PRESERVES` the
  `CONSTRAINT`/`INVARIANT` ids it must not violate, `CHANGED` the modified
  surfaces, and at least one `PROOF` line with pasted, re-runnable output. Its
  `## Provenance` section carries the per-binding drift fields the staleness join
  depends on. Externalising the run's intermediate work into this durable
  artifact is what lets the downstream `verify` and `review` passes judge it. Fill
  the `task.md` body sections as you work (`## Implementation or pass trace`,
  `## Verification matrix`, `## Promotion queue`, `## Self-review`).

## Preserves

- **The entire non-delta surface.** Every observable behaviour *not* in the delta
  is held end to end — the obligation a rewrite exists to honour alongside its
  delta (rule 1, rule 3). Constraints, invariants, and non-goals are held, not
  relaxed; changing an obligation's intent is an amendment decision at `improve`,
  never an `implement` action.
- **Only the assigned obligations.** Any change not traceable to an assigned
  obligation is an `## Unassigned changes` row in the trace (reason + authorizing
  ID, or `none`), judged at `review`.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the
  union of the assigned obligations' `WRITES` surfaces. A path touching a file
  outside any assigned obligation's declared write surface is the owned-path
  defect `SOL-O005` ("owned path outside declared write surface") — the property
  that keeps parallel `implement` packets write-disjoint. If you need a file
  outside your surfaces, stop: the write surface needs amending upstream; you do
  not widen it here.

## Core rules

### 1. The behaviour delta is explicit and recorded before any code is written

Before touching code, fill a before/after table naming **every** aspect that
changes — input handling, output shape, error behaviour, side effects, ordering,
defaults. The table is the contract: anything not on it MUST be preserved, and
anything you later change that is not on it is unauthorized. *Why:* a rewrite
permits behaviour to move, so without an explicit list there is no line between
an intended change and a smuggled one — the delta table *is* that line, and
writing it after the fact lets the implementation define the contract instead of
the reverse.

### 2. Acceptance criteria cover the new behaviour *and* the preserved behaviour

Each criterion is one of two kinds, both present: a **delta criterion** asserting
a behaviour that changed, and a **preservation criterion** stating a behaviour
that stayed the same. A rewrite that only tests its delta proves the intended
change was built and proves *nothing* about the regression risk it just created.
*Why:* the preserved surface is exactly where an unintended change hides; naming
the preservation criteria up front turns "I think the rest is fine" into a check
the reviewer can see.

### 3. Verify the two surfaces with two different oracles

The two surfaces demand two different kinds of proof, and conflating them is how
a rewrite ships an unproven regression:

- **The delta** is proven against its acceptance checks — each changed behaviour
  bound to its `test` / `command` / `manual` proof per its check binding. For a
  `test`-bound delta criterion, show the oracle valid by **flipping the
  assertion** (or commenting out the production path it exercises): the test MUST
  fail, then restore and it MUST pass — paste both transitions. A test that still
  passes when flipped exercises nothing.
- **The non-delta** is proven by an **equivalence check that would fail if any
  behaviour outside the delta changed** — property-based, differential (keep the
  pre-rewrite path reachable behind a shim and diff the two until clean on the
  preserved surface), or golden-output pinning the prior behaviour before the
  change. A green suite that never asserted the preserved behaviour is *necessary
  but not sufficient*; it covers only what was already tested, so a delta in an
  untested corner passes silently. Where no stronger oracle than the suite exists
  for the non-delta, record in the self-review *why* the suite is a sufficient
  oracle for this change (e.g. exhaustive named-test coverage of the touched
  surface, shown).

*Why:* the delta proof shows the intended change was built; the preservation
proof shows nothing else moved. Drop either and half the rewrite is unverified.

### 4. Identify and handle every affected caller

For each changed behaviour, `git grep` the rewritten symbols across the **whole**
codebase — not just the module under change — and for each caller either update
it for the new behaviour or verify it still works under the preserved behaviour.
Search the *string form* too (dynamic dispatch, registries, reflection,
generated code, config), which a search of the call syntax cannot reach. Paste
the output. *Why:* a behaviour change is safe only once every consumer of the old
behaviour is accounted for; "I checked, the callers are fine" without pasted
evidence is the most common way a rewrite breaks a caller it never looked at.

### 5. Halt and amend the spec on an emergent behaviour change

If during implementation you discover a behaviour change **not** in the delta —
stop. Either amend the spec to authorize it (adding a row to the delta and its
preservation/acceptance criteria) or revise the implementation to keep the
original behaviour. *Why:* a silent emergent change is the rewrite's signature
failure mode — it ships a behaviour nobody decided to ship; resolving it silently
in either direction is an amendment you are not authorized to make at
`implement`, so it goes upstream.

### 6. No redesign beyond the delta; promote, never fix inline

"Rewrite" is not a licence to redesign the surrounding module. Anything you spot
that is not on the assigned obligations / delta gets a `## Promotion queue` row
with target and status, not a silent fix. *Why:* extra restructuring dilutes the
rewrite's review surface and re-introduces the behaviour-drift risk this
discipline exists to bound; the reviewer must be able to tell the intended change
from a smuggled one. All promotion items MUST be resolved before the task closes.
(Do not, however, revert correct in-scope work merely because it grew larger than
expected — record the reasoning in the trace's decisions.)

### 7. Validate after every batch; forced visible output

Run `cmdValidate` (and `cmdTest`) after each batch, not only at the end, and
paste the output as you go — catching drift at batch 3 is cheaper than at batch
12, and pasting as you go means the proof exists before the claim that depends on
it. Any otherwise-invisible verification step MUST produce pasted, verbatim
output: a `PROOF` line referencing real run output is admissible; an unqualified
"tests passed" or "validation clean" is not. A no-`PROOF` `TRACE` claiming
`IMPLEMENTS` is a structural parse error (`SOL-S014`), and an
`IMPLEMENTS`/`PRESERVES` naming an unknown obligation is the unbound
cross-reference `SOL-M003`. The observed `proof_result` (`passed | failed |
blocked | unverified`) is only the core run observation; the `PASS` decision is
made downstream by the profile-independent `verify` pass, and the lifecycle
decorators (the 7-value verdict's `WAIVED` / `STALE` / `CONTRADICTED`) are
applied later at `review` — never here.

## Procedure

1. **Read the packet and the driving spec/audit, not the surface spec as scope.**
   Read the full `task.md` (parent contract, In/Out scope, obligations verbatim,
   constraints/invariants) and the spec or audit that prompted the rewrite.
   Resolve project commands from `AGENTS.md > Commands`; ask the user for any
   undefined slot.
2. **Confirm the owned paths.** Verify `write_surfaces` is a subset of the
   assigned obligations' `WRITES` surfaces. If you need a file outside it, stop —
   that is `SOL-O005`; the file belongs to another packet, or the write surface
   needs amending upstream.
3. **Fill the behaviour-delta table** (rule 1) — every aspect that changes,
   before/after, traced to the spec/audit. Then derive acceptance criteria
   covering both the delta and the preserved non-delta (rule 2).
4. **Capture the non-delta equivalence oracle before touching code** (rule 3).
   Establish the characterization / differential / golden baseline that pins the
   current behaviour of the preserved surface; run `cmdTest` and confirm green.
   If the suite is the only oracle, note the sufficient-oracle justification now.
5. **Inventory the callers** (rule 4) — `git grep` the rewritten symbols across
   the whole codebase plus their string forms; record who needs updating vs who
   stays under the preserved behaviour.
6. **Halt on ambiguity.** If an assigned obligation is unclear or contradictory,
   surface it — do not invent the requirement.
7. **Rewrite in batches.** After each batch run `cmdValidate` and `cmdTest`;
   paste both outputs as you go (rule 7). If a behaviour change emerges outside
   the delta, halt and amend (rule 5). Promote, never fix inline, anything out of
   scope (rule 6).
8. **Prove both surfaces** (rule 3): the delta against its acceptance checks
   (assertion-flip for `test`-bound criteria, both transitions pasted); the
   non-delta against the equivalence oracle.
9. **Write the TRACE claims.** Per obligation: `IMPLEMENTS` / `PRESERVES` /
   `CHANGED` + at least one pasted `PROOF` line (rule 7). Record the
   `## Provenance` drift fields per binding.
10. **Resolve the promotion queue** (rule 6) — every out-of-scope discovery has a
    target + status; none left unresolved.
11. **Self-review** — see below; the task is not done until every check is
    answered in writing with the evidence pasted.

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
- The observed `proof_result` maps 1:1 to the downstream core verdict
  (`passed → PASS`, `failed → FAIL`, `blocked → BLOCKED`,
  `unverified → UNVERIFIED`); a `rewrite` pass records only this core
  observation. The `PASS` gate is decided by the profile-independent `verify`
  pass, and the 3 lifecycle decorators of the 7-value verdict (`WAIVED` / `STALE`
  / `CONTRADICTED`) are applied later at `review` — not here. The Builder stance
  may influence which proofs are *demanded*; it never decides whether a run
  PASSes.

## What does not belong

- **In a rewrite:** behaviour changes not in the delta table (halt and amend,
  rule 5), scope expansion to "redesign while we're here" (promote, rule 6), and
  net-new capability against a fresh spec (that is a `feature`).
- **In the behaviour-delta table:** a row with `Behaviour change?` left blank —
  make the call; an aspect is either in the delta or preserved, never undecided.
- **In the trace's decisions:** silently resolved ambiguities or silently
  authorized emergent changes — both halt the work and go upstream.

## Anti-patterns

- ❌ Coding before the behaviour delta is written → rule 1; the implementation
  must not define the contract.
- ❌ A behaviour change that never made the delta table → halt and amend the spec
  (rule 5); a silent emergent change is the signature failure mode.
- ❌ Treating "rewrite" as a licence to redesign the surrounding module →
  promote out-of-scope work (rule 6).
- ❌ Mislabelling: calling it a `refactor` when behaviour changes, or a `rewrite`
  when behaviour is fully preserved (the latter is a `refactor`) → relabel before
  proceeding.
- ❌ Testing only the delta, never the preserved surface → the regression risk
  lives in the non-delta (rule 2, rule 3).
- ❌ "Callers are fine" without pasted `git grep` (call syntax *and* string form)
  → rule 4.
- ❌ Declaring a `test`-bound delta criterion done on a green suite with no flip →
  flip the assertion and paste the fail-then-pass transition (rule 3).
- ❌ "Tests passed" with no pasted output → paste the runner's last lines
  verbatim, fenced, unmodified (rule 7).

## Self-review

> **Hard gate.** The task is not complete until every question below has a
> written answer directly beneath it, with the named output pasted verbatim.
> Rewrites are riskier than refactors because behaviour is permitted to change —
> act as a senior engineer doing an adversarial review of your own diff.

- **Verification outputs (paste actual command output — do not paraphrase):**
  `git status`; `cmdValidate` (last 2 lines); `cmdTest` (last 2 lines).
- **Behaviour-delta integrity:** Does every behaviour change you made appear in
  the delta table? Did any change sneak in that was not planned? For the
  preserved non-delta, what is the equivalence oracle, and would it fail if
  behaviour changed — and is its output pasted?
- **Two-surface proof:** Is every delta criterion proven against its check
  binding (assertion-flip transition pasted for `test`-bound ones)? Is every
  preservation criterion proven by the equivalence oracle (or the
  sufficient-oracle justification recorded if the suite was the only oracle)?
- **Caller migration:** Did you `git grep` every caller of the rewritten symbols
  across the *whole* codebase, including string forms? Did you update each for
  the new behaviour or verify each still works under the preserved behaviour? Is
  the search output pasted?
- **Scope:** Did I touch only the assigned obligations and only the declared
  write surfaces (no `SOL-O005`)? Did "redesign while we're here" creep in? Are
  all promotion items resolved? Any correct in-scope work that grew beyond the
  estimate is noted in decisions, not reverted.
- **Completeness:** Is anything left stubbed, TODO'd, or half-rewritten? Could the
  next developer continue from this task file alone?
- **Final adversarial pass:** What is now subtly different that the oracle does
  not cover? What else could make this more stable or correct? Do not close
  without this.

## Bundled resources

- `references/task-template.md` — a fillable rewrite-task frame (objective,
  behaviour-delta table, acceptance criteria with preservation criteria, module
  plan, progress checklist, decisions, findings, and a self-review hard gate). It
  scores on the multi-stage-plan, state-separate-from-deliverable, and
  paste-output-gate criteria, so it ships a template. Instantiate it into your
  local task file, resolve the `cmd*` slots from `AGENTS.md > Commands` (asking
  the user for any undefined slot), and fill it in as you work.
