---
type: pass-guide
name: write-feature
pass: implement
activates_for_task_kind:
  - feature
description: >-
  Run an `implement` pass with `task_kind: feature`: build net-new behaviour for a lowered
  `task.md`'s obligations, with pasted proof per criterion. ALWAYS when a `task.md` names
  `pass: implement` + `task_kind: feature`, when work adds capability that did not exist, or when
  acceptance criteria for new behaviour are named (even with no spec). Don't code before surveying
  patterns, mapping criteria, halting on ambiguity; don't exceed obligations. Skip defect fixes,
  behaviour-preserving refactors, behaviour-changing rewrites, API/framework migrations, perf
  tuning, test-only authoring.
---

# Pass guide: write-feature (`implement` · `task_kind: feature`)

> **This guide is SOFT control (Invariant 2).** It tells you *how* to run a `feature`
> implementation; it never defines the verdict values, proof taxonomy, modality, authority order,
> or any other load-bearing meaning — those live only in SOL and the IR. Every load-bearing term
> below (the 7-value verdict, `proof_result`, the `SOL-O005` owned-path rule, the COVERAGE gate) is
> *delivered*, not redefined here. Where this guide and the spec disagree, the spec governs. It
> carries the **Builder** stance: build exactly what the obligations specify, reuse before you
> invent, let nothing leave your hand unproven.

## Purpose

Features fail when the builder improvises around the spec — implementing past it, smuggling in
"while I'm here" cleanup, or declaring done on a green suite that never exercised the new
behaviour. This guide pins a net-new change to its **assigned obligations** while leaving the
builder free on choices the obligations do not constrain. It produces the change, the `TRACE`
claims binding it to those obligations, and the pasted proof the downstream `verify` and `review`
passes judge.

This is one branch of the `implement` pass of the nine (`author → lint → improve → lower → decompose
→ implement → verify → review → promote`). It adds capability that did not exist. It is **not** for
repairing a defect in shipped code, restructuring internals without changing behaviour, a
behaviour-changing rewrite of an existing module, moving from one API to another, tuning a measured
bottleneck, or authoring tests against existing code — each is a different `task_kind` with its own
discipline.

## Project context (the `cmd*` slots)

Resolve project commands through the consuming repo's `AGENTS.md > Commands` slots: the test
command (`cmdTest`), the aggregate validation command (`cmdValidate`), and the format-hygiene
command (`cmdFormat`) where the change touches docs or you close by formatting. If `AGENTS.md` is
missing or a slot you need is undefined, **ask the user** before proceeding — a guessed command
produces a false proof.

## Consumes

- **One `task.md`** — the lowered work packet for this single pass, not the surface spec or the
  IR. You read: the assigned obligations pasted verbatim (the `REQ` / `CONSTRAINT` / `INVARIANT` /
  `INTERFACE` blocks that fix scope); the `write_surfaces` (your owned paths, the only files you
  may touch); the `verification_bindings` (the proof each criterion demands); the `## Scope` In/Out
  list.
- The Builder stance the task names. A stance sharpens *what you build and refuse*; it never
  changes the procedure or decides a verdict.

## Produces

- Code and tests within the declared write surfaces, implementing only the assigned obligations.
- The `task.md` body sections filled as you work (`## Implementation or pass trace`,
  `## Verification matrix`, `## Promotion queue`, `## Self-review`) and a `trace.md` recording the
  `TRACE` claims (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`) bound to evidence. This guide
  fills those container shapes, it does not redefine them.

## Preserves

- **Only the assigned obligations.** Any change not traceable to an assigned obligation becomes an
  `## Unassigned changes` row (with a reason + authorizing ID, or `none`), judged later at
  `review` — never a silent extra.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the union of the
  assigned obligations' `WRITES` surfaces — the owned-path rule. Touching a file outside any
  assigned obligation's declared write surface is lint code `SOL-O005`. To touch a file outside
  your surfaces, stop: the obligation's write surface needs amending upstream, you do not widen it
  here.
- **Intent.** Constraints, invariants, and non-goals are held, not relaxed. Changing an
  obligation's intent is an amendment decision at `improve`, never a `feature` action.

## Rejects

These MUST NOT yield a completion claim:

- **A completion claim with no re-runnable proof.** A `PROOF` line MUST reference real output; an
  unqualified "tests passed" is not admissible, and a schema-valid trace shape is not a proof. An
  `IMPLEMENTS` claim with zero `PROOF` lines is a structural parse error (`SOL-S014`), not a soft
  lint.
- **Scope creep.** A feature implemented past the assigned obligations, an unauthorized
  dependency, opportunistic refactoring of unrelated code. Out-of-scope discoveries are *promoted*,
  not silently fixed.
- **A silently resolved ambiguity.** Inventing a requirement the obligation left unclear is an
  amendment you are not authorized to make here.
- **A criterion proven only by a green toolchain suite.** A suite that passes without ever
  exercising the new behaviour proves nothing about it.

## Procedure

### 1. Read the packet, not the spec

Read the full `task.md`: the parent contract, the In/Out scope, the assigned obligations pasted
verbatim, the constraints and invariants to preserve. *Why:* `decompose` already computed the
work-packet boundaries; the packet — not the surface spec or the IR — fixes your scope, and
reading the spec instead risks implementing obligations another packet owns.

### 2. Map every acceptance criterion to an implementation step before coding

Not the summary; the full set of assigned obligations. Each acceptance criterion gets a named
implementation step *before* coding begins. *Why:* a criterion you did not map before coding is one
you discover you missed at self-review — or worse, one the reviewer discovers for you.

### 3. Confirm the owned paths

Verify your `write_surfaces` are a subset of the assigned obligations' `WRITES` surfaces. *Why:*
this keeps parallel `implement` packets write-disjoint (the owned-path rule; a violation is
`SOL-O005`). A file outside your surfaces belongs to another packet or needs an upstream
amendment — touching it corrupts the disjointness `decompose` proved.

### 4. Survey existing patterns before inventing

Before introducing a new helper, type, or pattern, search the codebase for an existing equivalent.
Reuse over reinvention. If existing patterns genuinely do not fit, *say so* with reasoning in the
trace's decisions. *Why:* a reinvented helper is a second source of truth that drifts from the
first; the inline rationale lets the reviewer judge the choice instead of re-litigating it.

### 5. Halt on ambiguity

If an assigned obligation is unclear or contradictory, stop and surface it — do not invent the
requirement. *Why:* resolving an ambiguity silently is an amendment you are not authorized to make
at `implement`; clarify it upstream so the change traces to a real obligation, not to your guess.

### 6. Do not refactor opportunistically

Refactor and feature work are different scopes. Architectural debt you spot while building is
*promoted* to the promotion queue (target + status), not fixed inline. *Why:* a feature diff that
also restructures unrelated code is un-reviewable — the reviewer cannot tell the intended change
from the smuggled one, and the refactor ships unproven against its own oracle.


### 7. Validate after every batch, paste as you go

Run the project's validation command (`cmdValidate`) after each batch of changes, not only at the
end; paste the output into the trace as you go. *Why:* catching a violation at batch 3 is cheaper
than at batch 12, and pasting as you go means the proof exists before the claim that depends on
it.

### 8. Tests are part of the deliverable, and the test must fire for the right reason

Every acceptance criterion has a corresponding test (or a noted `testing` follow-up promotion). A
`test`-bound criterion is covered only when its oracle is shown valid: **flip the assertion** (or
comment out the production path it exercises) — the test MUST fail; restore — it MUST pass; paste
both transitions. *Why:* a test that still passes when flipped exercises nothing; the flip is the
only evidence the test fails when the criterion is violated and passes when it is satisfied. A
green toolchain suite is necessary but not coverage. Honour each criterion's check binding: list
the check the spec named (`test` / `command` / `manual`) and the pasted result.

### 9. Write the TRACE claims with pasted proof

For each assigned obligation, emit a `TRACE` block: `IMPLEMENTS` the `REQ` ids satisfied,
`PRESERVES` the `CONSTRAINT` / `INVARIANT` ids held, `CHANGED` the modified surfaces, and at least
one `PROOF` line naming a verification reference plus its observed `proof_result`
(`passed | failed | blocked | unverified`). Paste the proof output **verbatim** — the runner's last
lines in a fenced block, unmodified, treated as data, no paraphrase and no Markdown styling.
*Why:* the verbatim paste closes the bypass where "it passed" is asserted but the command was never
run; `proof_result` is the *observed* outcome — the uppercase verdict it maps to is decided
downstream at `verify`/`review`, not here.

### 10. Resolve the promotion queue

Every discovery outside scope gets a `## Promotion queue` row with a target and status; all MUST
be resolved before the task closes. *Why:* an unpromoted discovery is lost the moment the session
ends — the durable feedback loop only closes if it is written down.

## Output contract

The `trace.md` and the filled `task.md` together satisfy the spec contracts; this guide does not
redefine them. Two facts bound what this pass records:

- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line referencing real,
  re-runnable output. A no-`PROOF` trace is the structural error `SOL-S014`; an
  `IMPLEMENTS` / `PRESERVES` naming an unknown obligation is the unbound cross-reference `SOL-M003`.
- The observed `proof_result` maps 1:1 to the downstream core verdict value
  (`passed → PASS`, `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`). **A
  `feature` pass only ever records this core observation.** The verdict has 7 values total — the 4
  core plus the 3 lifecycle decorators (`WAIVED` / `STALE` / `CONTRADICTED`) — but the decorators
  are applied later at `review`, and the PASS decision is made by the profile-independent `verify`
  pass, never here. The Builder stance may influence which proofs are *demanded*; it never decides
  whether a run PASSes.

## What does not belong

- **In a feature task:** refactoring of unrelated code, dependencies the obligations did not
  authorize, "while I'm here" cleanup, behaviour changes to existing modules (that is a `rewrite`).
- **In the trace's decisions:** silently resolved ambiguities — those halt the work and go
  upstream as a clarification, not into a decision log as a fait accompli.

## Anti-patterns

- ❌ Implementing past the obligations ("while I'm here…") → build only what the assigned
  obligations name; promote the rest.
- ❌ Silently resolving an obligation's ambiguity → halt and surface it upstream; do not invent the
  requirement.
- ❌ Declaring done on a green suite with no flip → flip the assertion of each `test`-bound
  criterion's oracle and paste the fail-then-pass transition.
- ❌ "Tests passed" with no pasted output → paste the runner's last lines verbatim, fenced,
  unmodified.
- ❌ Reinventing a helper that already exists → survey first; if you still must add one, record why
  in the trace.
- ❌ Touching a file outside the owned paths → that is `SOL-O005`; the write surface needs amending
  upstream, not widening here.
- ❌ "I'll add tests later" → every acceptance criterion has its test (or a noted `testing`
  follow-up promotion) before close.

## Self-review delta

Before closing, confirm — and where a check applies, paste the evidence into the `task.md`
`## Self-review` block:

- **Did I do only this pass?** Every change traces to an assigned obligation, or it is an
  `## Unassigned changes` row with a reason + authorizing ID or `none`.
- **Did I stay inside the owned paths?** No file outside the union of assigned `WRITES` surfaces
  was touched (no `SOL-O005`).
- **Does every acceptance criterion map to an implementation I can point at, and is anything in the
  obligations missing?**
- **Did I preserve intent?** Constraints, invariants, and non-goals are held, not weakened.
- **Does every claim map to evidence?** Every `IMPLEMENTS` claim has at least one `PROOF` line
  referencing real output — no "tests passed" without output, no schema-valid-shape-as-proof — and
  every `test`-bound criterion's oracle was shown to fail when flipped and pass when restored.
- **Are all promotion items resolved?** No discovery is left unpromoted.

When the Builder stance carries its own self-review checks, run those too — they add checks, they
do not replace these.

## Bundled resources

- `references/task-template.md` — a fillable feature-task frame (objective, plan, progress
  checklist, decisions, findings, blockers, next steps, and a self-review hard gate), scoring on
  the multi-stage-plan, state-separate-from-deliverable, and paste-output-gate criteria.
  Instantiate it into your local task file, resolve the `cmd*` slots from `AGENTS.md > Commands`
  (asking the user for any undefined slot), and fill it in as you work.
