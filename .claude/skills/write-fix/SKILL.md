---
name: write-fix
type: pass-guide
pass: implement
activates_for_task_kind:
  - fix
description: >-
  Run a `fix` implement pass: reproduce the defect, patch the root cause, add a
  regression test red-before/green-after, run the full suite, record TRACE with
  proof. ALWAYS apply when a `task.md` names `pass: implement` and
  `task_kind: fix`, or asked to fix, patch, resolve, or close a bug, regression,
  or defect, even with none named. Never patch the symptom, ship
  without a before/after regression test, or scope-creep. Skip when authoring
  the bug report, for behaviour-preserving refactors, or rewrites of existing
  modules; a flaky / non-deterministic failure has its own `fix-flaky-test`
  guide.
---

# Pass guide: write-fix (the `fix` task_kind)

> **SOFT control (Invariant 2).** This guide tells you *how* to run a `fix`
> implement pass. It does **not** define modality, authority order, verification
> semantics, the verdict values, or the proof taxonomy — those are owned only by
> SOL and the typed IR. Every load-bearing term below (a
> `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` obligation, a `TRACE` block,
> `IMPLEMENTS`/`PRESERVES`/`CHANGED`/`PROOF`, the 7-value verdict, a lint code
> like `SOL-O005`) is **cited, not redefined**. Where this guide and the language
> reference disagree, the reference governs.
>
> **Narrow guide, not the umbrella.** The general `implement` guide branches
> across all implementation kinds; this one carries the full `fix` discipline at
> depth. A `task.md` whose `task_kind` is `fix` loads this guide. A **flaky /
> non-deterministic** failure is a different oracle — reproduced by *looping* a
> single test, not by re-running a deterministic reproduction — so it is handled
> by the separate `fix-flaky-test` guide, not duplicated here.

## Purpose

Fixes fail two ways, both producing a green-looking diff that ships the bug.
**Patching the symptom**: suppressing the visible failure while the root cause
survives, so the defect recurs through a different path. **A regression test
that does not exercise the bug**: one green before the patch proves nothing,
because it stays green if the fix is deleted. Make the bug stay fixed —
reproduce it, patch its cause, bind a regression test red before the patch and
green after, both transitions pasted as proof.

## Stance: the Skeptic sharpens this pass

A `fix` runs under the **Skeptic** profile by default — refute-by-default
applied to your own patch. Root-causing demands the same hostility to a
plausible explanation that reviewing another agent's branch does: thinking
*"this should fix it"* without having watched the regression test go red then
green is the gate failing, not the work finishing. The Skeptic's standing
questions bite here — *what would falsify this fix? what did NOT change that
should have? what was claimed but never verified?* — and its red flags apply on
sight: a summary-only "tests passed", a small diff waved through, and especially
*"I can't reproduce it, must be environment-specific"* (the discrepancy is itself
a finding, not a dismissal). The profile sharpens *what you look for and refuse*;
it never changes the procedure below and never decides a verdict.

## Consumes

- One `task.md` — the lowered work packet for this single pass. `implement` works
  against the packet `decompose` handed it, **not** the surface spec or the IR.
  You read: the `assigned_obligations`, `constraints`, and `invariants` (the SOL
  blocks pasted verbatim in the body, which fix scope); the `write_surfaces`
  (your **owned paths**, the only files you may touch); and the
  `verification_bindings` (the proofs each obligation demands).
- The bug report (or defect description) the fix resolves — its reproduction
  steps, the root cause it cites at `file:line`, and any related defects nearby.
  If no bug report exists and the defect is described only in chat, write the
  reproduction into the task file first; an undocumented defect has nothing to
  prove a fix against.
- Project command slots resolved through the consuming repo's `AGENTS.md`
  (`cmdValidate`, `cmdTest`, and `cmdLint` / `cmdTypecheck` where the validate
  slot does not aggregate them). If `AGENTS.md` is missing or a named slot is
  undefined, **ask the user which command to run — do not guess.** A guessed test
  command produces a false signal about whether the bug is gone.

## Produces

- The minimal code change that removes the defect, within the declared write
  surfaces.
- A regression test bound to the defect — red before the patch, green after.
- A `trace.md` recording the `TRACE` claims against the assigned obligations,
  binding each to evidence, plus the `## Provenance` fields the staleness join
  depends on. The `task.md` body sections you fill as you work: `## Implementation
  or pass trace`, `## Verification matrix`, `## Promotion queue`, `## Self-review`.

## Preserves

- **Only the assigned obligations.** Any change not traceable to an assigned
  obligation becomes an `## Unassigned changes` row in the trace (with a reason +
  authorizing ID, or `none`), judged at `review` — never a silent edit.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the
  union of the assigned obligations' `WRITES` surfaces — a file touched outside
  that union is lint code **`SOL-O005`** ("owned path outside declared write
  surface"). This keeps parallel `implement` packets write-disjoint. If the fix
  needs a file outside your owned paths, stop: either it belongs to another
  packet, or the obligation's write surface needs amending upstream — not an
  `implement` decision.
- **Intent.** Constraints, invariants, and non-goals are held, not relaxed. A fix
  that makes the test pass by weakening a `CONSTRAINT` or `INVARIANT` is not a
  fix; changing an obligation's intent is an amendment decision at `improve`,
  never an `implement` action.

## Core rules

### 1. Reproduce the bug in your worktree before you patch

Re-run the bug report's reproduction in *your* worktree and confirm the bug
fires. Paste the output. The bug report's author ran the reproduction in their
environment; a fix proven against a reproduction you never saw fire is
unfalsifiable. **If you cannot reproduce, do not patch.** A discrepancy between
your environment and the report's is itself a finding: investigate it (versions,
seeds, fixtures, data, clock, OS) and surface it as a blocker, not dismiss it as
"environment-specific". *Rationale:* the reproduction is the falsification target
for the whole task; without it, "fixed" is a claim with no possible
counter-evidence.

### 2. Patch the root cause, not the symptom

The bug report cites the root cause at `file:line`. Patch *there*. A
symptom-patch — swallowing an error, clamping a value, special-casing the one
triggering input — leaves the cause live, so the bug recurs through a different
path next time the cause is hit. Before patching, restate in your own words *why*
this location is the cause and not merely where the failure became visible; if
you cannot, you have not root-caused it. *Rationale:* symptom-patches convert one
reported defect into a family of latent ones that surface later under a different
trigger.

### 3. The regression test fires before the fix and passes after

The regression test is the proof the bug is gone, and counts only if it actually
exercises the bug:

- Patch **out** your fix (revert the change, or comment out the path it touches);
  run the test → it MUST fail. This proves the test exercises the defect.
- Restore the fix; run the test → it MUST pass.

Paste **both** outputs into the self-review (at minimum the failing-then-passing
transition). A regression test that stays green when the fix is removed is a
tautology — it tests nothing, the second of the two failure modes this guide
prevents. Assert on the *behaviour* the bug broke (the observable output, the
returned value, the emitted event), not on internal state. *Rationale:* an
unflipped test is indistinguishable from a test that never ran the buggy path.

### 4. No scope creep — promote, don't bundle

Bugs have neighbours, and a fix task is the most tempting place to "just also
fix" the related defect, tidy the surrounding code, or rename the confusing
variable. Don't. This task fixes **the** assigned defect. Every related finding —
a neighbouring bug, a refactor opportunity, a missing test elsewhere — becomes a
`## Promotion queue` row with a target (a follow-up bug-report or audit) and a
status; all rows MUST be resolved before the task closes. *Rationale:* a bundled
"while I'm here" change is untraceable to any assigned obligation, lands as an
`## Unassigned changes` row, and turns a reviewable one-cause fix into a diff no
reviewer can reason about as a unit.

### 5. Run the full test suite, not just the regression test

A patch that passes its own regression test but breaks a neighbour is a worse
defect than the one you fixed — a known bug traded for an unknown one. Run the
project's full test command (`cmdTest`) and validation (`cmdValidate`) after the
patch, and paste the output. *Rationale:* the regression test proves the reported
bug is gone; only the full suite proves you did not introduce a new one.

### 6. Keep the fix minimal and record why it addresses the cause

Ship the smallest change that removes the defect. In the trace's reasoning (the
`## Implementation or pass trace` and, for design choices, the task's decision
log), state *why* this patch addresses the root cause and not just the symptom —
the fix's reviewer checks exactly this. Do not write "the patch worked" there;
that is a verification output (it belongs pasted in the self-review), not a design
decision. *Rationale:* the minimal-fix rule makes rule 4 enforceable — every line
beyond the minimum is one a reviewer must ask "what obligation authorized this?".

### 7. Write the TRACE claims with pasted, re-runnable proof

For the assigned obligation(s), emit a `TRACE` block: `IMPLEMENTS` the `REQ` ids
the fix satisfies; `PRESERVES` the `CONSTRAINT`/`INVARIANT` ids it must not
violate; `CHANGED` the modified surfaces; and at least one `PROOF` line naming the
verification reference plus its observed `proof_result` (`passed | failed |
blocked | unverified`). A `TRACE` claiming `IMPLEMENTS` with **zero** `PROOF`
lines is a structural parse error (`SOL-S014`), not a soft lint. Paste the proof
output verbatim — fenced, last lines minimum, treated as data, no paraphrase. An
unqualified "tests passed" is not admissible proof. *Rationale:* the observed
`proof_result` is the only thing the downstream `verify` pass can turn into a
verdict; a claim with no real output is one the pipeline cannot judge.

### 8. `implement` records the observation; it never renders the verdict

You record the *observed* `proof_result` and nothing more. It maps 1:1 to a core
verdict value downstream — `passed → PASS`, `failed → FAIL`, `blocked → BLOCKED`,
`unverified → UNVERIFIED` — but the verdict has **7 values total** (4 core plus
the 3 lifecycle decorators `WAIVED`/`STALE`/`CONTRADICTED`), and the PASS decision
is made by the profile-independent `verify` pass, with the lifecycle decorators
applied later at `review` — never here. The Skeptic stance may sharpen *which*
proofs you demand of yourself; it never lets you self-certify a PASS. *Rationale:*
a generator scoring its own output favours itself; separating the observation
(here) from the verdict (verify) removes that self-preference hazard.

## What does not belong

- **In a fix task:** unrelated cleanup, "while I'm here" improvements, or multiple
  bug fixes bundled into one packet — these belong in the `## Promotion queue` as
  follow-up tasks (rule 4).
- **In the regression test:** assertions on internal/private state — test the
  *behaviour* the bug broke (rule 3).
- **In the trace's decision log:** "the patch worked" — that is a verification
  output to be pasted in the self-review, not a design decision (rule 6).
- **In this guide:** the flaky-test discipline. A non-deterministic failure is
  reproduced by looping a single test and root-caused by category (ordering,
  timing/concurrency, shared state, resource) — that procedure lives in the narrow
  `fix-flaky-test` guide. Do not re-run a flaky test until it goes green and call
  it fixed; load that guide instead.

## Anti-patterns

- ❌ Patching the symptom (swallowing the error, clamping the value, special-casing
  the one triggering input) → fix the cause cited at `file:line` (rule 2).
- ❌ Skipping reproduction in your own worktree → reproduce and paste it before
  patching; a non-reproducing bug is a blocker, not a licence to patch (rule 1).
- ❌ A regression test that stays green when the fix is removed → flip it red first;
  an unflipped test is a tautology (rule 3).
- ❌ "I can't reproduce it, must be environment-specific" → the discrepancy is the
  finding; investigate and surface it (rule 1, Skeptic red flag).
- ❌ Scope creep — "while I'm here, this related bug…" → promote it, don't bundle it
  (rule 4).
- ❌ Bundling the fix with unrelated cleanup → minimal fix only; every extra line
  needs an authorizing obligation (rule 6).
- ❌ "Tests passed" with no command, exit code, or pasted output → paste the real,
  re-runnable output; shape is not proof (rule 7).
- ❌ Looping a deterministic reproduction, or re-running a flaky test until green →
  wrong oracle; a flake belongs to the `fix-flaky-test` guide (`## What does not
  belong`).

## Output contract

The `trace.md` and the filled `task.md` together satisfy the SOL contracts; this
guide does not redefine them. The trace records, per assigned obligation, the
`TRACE` block (rule 7), the `## Provenance` fields per binding, the
`## Verification matrix` (ID → required proof → actual proof → status), any
`## Unassigned changes` (each with a reason + authorizing ID, or `none`), and the
`## Promotion items` (target + status). The two pasted proofs that make a fix
admissible: the **pre-patch reproduction** (the bug fires) and the **failing →
passing regression-test transition** (the test is a valid oracle, and the bug is
gone) — both verbatim, fenced, as data.

## Self-review delta

Before closing, confirm — and paste the evidence into the `task.md` `## Self-review`
block where a check produces output:

- **Reproduction.** The bug fired in *my* worktree before the patch, and that
  output is pasted. (If it would not reproduce, I surfaced a blocker — I did not
  patch.)
- **Root-cause coverage.** I patched the cause cited at `file:line`, not a symptom
  elsewhere. The bug cannot recur via a different path under the same cause.
- **Regression-test integrity.** The regression test *fails* when I patch out the
  fix — I verified it and pasted the failing-then-passing transition.
- **Side effects.** `cmdTest` and `cmdValidate` pass for the *whole* suite, not
  just the regression test; the output is pasted.
- **Scope.** Every change is traceable to the assigned obligation, or it is an
  `## Unassigned changes` row with a reason + authorizing ID or `none`. Related
  defects are promoted, not bundled. No file outside the owned paths was touched
  (no `SOL-O005`).
- **Minimality.** This is the *minimum* fix — I did not sneak in a "small
  improvement" that changes behaviour beyond the bug.
- **Verdict discipline.** I recorded only the observed `proof_result`; I did not
  self-certify a PASS (the Skeptic red flag of an implementer rendering the verdict
  on their own change).

> **Hard gate.** The task is not complete until the pre-patch reproduction output
> and the failing → passing regression-test transition appear verbatim in the
> `## Self-review` block. A symptom-patch leaves the bug latent — close as a
> senior engineer hostile to "looks fine".

## Bundled resources

- `references/task-template.md` — a fillable `fix` task frame with a reproduction
  block, an iteration trail (the verbal-feedback loop the next attempt reads), a
  progress checklist, and a self-review hard gate demanding the pre-patch and
  post-patch reproduction output. Copy it into your project's task-file location,
  substitute the `{{...}}` placeholders from the consuming repo's `AGENTS.md`
  command slots, and fill it as you work.
