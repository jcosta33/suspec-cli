---
type: pass-guide
name: write-testing
pass: implement
activates_for_task_kind:
  - testing
description: >-
  Implement `task_kind: testing`: tests are the deliverable, behaviour-focused, proven by flip-
  the-assertion. ALWAYS apply when a `task.md` names `pass: implement` + `task_kind: testing`, or
  the work is add tests / close a coverage gap / write a regression / harden a suite (incl. a
  promoted "Needed: test"). Never assert internals, bundle unrelated behaviours, chase a coverage
  %, ship an unflipped test, or edit production code to pass a test without an authorising
  obligation. Skip implementing/fixing code (tests ride inside those), stabilising a flaky test,
  refactors, rewrites, migrations, perf tuning.
---

# Step guide: write-testing (`implement` · `task_kind: testing`)

> **This guide is SOFT control (Invariant 2).** It tells you *how* to run a `testing`
> implementation; it never defines the verdict values, the proof taxonomy, the proof-strength
> order, oracle adequacy, modality, authority order, or any other load-bearing meaning — those live
> only in SOL and the structured form. Every load-bearing term used below (the 7-value verdict, `proof_result`,
> the proof-strength order, the `oracle_adequacy` record and its `SOL-V011` finding, the
> `SOL-O005` owned-path rule, the COVERAGE gate) is *delivered*, not redefined here. Where guide and
> spec disagree, the spec governs. It carries the **Test-Author** stance: a test is a specification
> by other means — make it fail for one reason, exercise the behaviour the caller cares about, and
> survive a refactor that preserves that behaviour.

## Purpose

Tests fail their job in three quiet ways: the test that passes even when the code under test is
commented out (pure ceremony), the test that reaches into internals and shatters on a
behaviour-preserving refactor (the test broke, not the code), and the test that bundles six
unrelated assertions so a failure says "something broke" without saying *what*. All three are
net-negative — they cost maintenance and catch nothing. This guide keeps a `testing` deliverable
honest: behaviour-focused, one-reason-to-fail, proven to fire, and robust against
behaviour-preserving refactors.

This is one branch of the `implement` step of the nine (`author → lint → improve → lower → decompose
→ implement → verify → review → promote`), for **adding or improving test coverage as a
deliverable in its own right**. It is **not** for writing tests *as part of* building a feature or
fixing a defect (tests already ride inside those deliverables), nor for stabilising a test that
fails non-deterministically — each is a different discipline with its own oracle.

## Project context (the `cmd*` slots)

Resolve project commands through the consuming repo's `AGENTS.md > Commands` slots: the test command
(`cmdTest`) and aggregate validation command (`cmdValidate`). A `testing` task often also wants a
**coverage report** and a per-test **loop or focus runner** (to run one test in isolation, or
flip-and-rerun cheaply) — not part of the standard `cmd*` contract. If `AGENTS.md` is missing, or a
slot you need (including a coverage or single-test runner) is undefined, **ask the user** which
command to run before declaring any new test "passing" — never guess: a guessed command produces a
false proof.

## Consumes

- **One `task.md`** — the structured work packet for this step, not the surface spec or the structured form. Read in
  particular: the assigned obligations pasted verbatim (the `REQ` / `CONSTRAINT` / `INVARIANT` /
  `INTERFACE` blocks fixing what behaviour you test); the `write_surfaces` (your owned paths — the
  test files and any test-support surface, never production code unless an obligation authorises it);
  the `verification_bindings` (the check each criterion demands); and the `## Scope` In/Out list.
- The driving doc the packet points at when there is one (the spec, audit, or bug report whose
  "Needed: test" item generated this work) — it names which behaviour the test must encode.
- The Test-Author stance the task names. A stance sharpens *what you assert and refuse*; it never
  changes the procedure or decides a verdict.

## Produces

- New or strengthened tests within the declared write surfaces, each exercising the public surface
  of an assigned obligation's behaviour.
- For every test, the pasted **flip-the-assertion** transition — the test failing when its assertion
  is flipped (or the production path it exercises is commented out) and passing when restored —
  proving the test is not a tautology.
- The `task.md` body sections filled as you work (`## Implementation or step trace`,
  `## Verification matrix`, `## Promotion queue`, `## Self-review`) and a `trace.md` recording the
  `TRACE` claims (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`) bound to that evidence. This
  guide fills those container shapes; it does not redefine them.

## Preserves

- **Only the assigned obligations.** The behaviour you test is fixed by the assigned obligations; a
  test for behaviour another packet owns is out of scope. Any change not traceable to an assigned
  obligation becomes an `## Unassigned changes` row (reason + authorizing ID, or `none`), judged at
  `review` — never a silent extra.
- **Only the declared write surfaces.** Owned paths MUST stay a subset of the union of the assigned
  obligations' `WRITES` surfaces — the owned-path rule; a path outside any assigned obligation's
  declared write surface is lint code `SOL-O005`. In particular, **do not edit production code to
  make a test easier to write** unless an assigned obligation authorises it: that inverts the
  dependency (the test exists because of the code's behaviour) and almost always lands outside your
  surfaces. Hard-to-test code is a *finding to promote*, not a licence to weaken production behaviour.
- **The signal of the suite.** A test must fail when the behaviour it guards is broken and pass when
  it is correct. A test tuned until green is worse than no test — it manufactures confidence the code
  has not earned.

## Rejects

These MUST NOT yield a completion claim:

- **A test you did not flip.** "It passes" is unfalsifiable from a green tick alone — the test could
  be tautological, assert a condition true regardless of the code, or never have run. Without the
  pasted flip-and-rerun transition, the test is unproven.
- **A test on internals.** Assertions on private methods, module-private state, or other internals
  break on a behaviour-preserving refactor — the test failing, not the code. Exercise the public
  surface.
- **A bundled test.** Multiple unrelated behaviours in one case. When it fails it says "something
  broke" without saying which behaviour — split it, one reason to fail per test.
- **A coverage percentage treated as the goal.** A covered-but-poorly-tested line is worse than an
  uncovered one; it gives false security. Coverage is a smell to read, never a target to hit.
- **A criterion-bound test that fires for the wrong reason.** When the test is the oracle for a spec
  acceptance criterion, a green flip proves only that it fires — *not* that it fires for the
  criterion's reason. It must assert the behaviour the criterion describes and fail when that
  criterion is violated, not when some adjacent condition happens to hold.
- **A completion claim with no re-runnable proof.** A `PROOF` line MUST reference real output; an
  unqualified "tests passed" is not admissible, and a schema-valid trace shape is not a proof. An
  `IMPLEMENTS` claim with zero `PROOF` lines is a structural parse error (`SOL-S014`), not a soft
  lint.

## Procedure

### 1. Read the packet, not the spec

Read the full `task.md`: the parent contract, In/Out scope, assigned obligations pasted verbatim,
the constraints and invariants to preserve, and the driving doc's "Needed: test" item if there is
one. *Why:* `decompose` already computed the work-packet boundaries; the packet — not the surface
spec or structured form — fixes which behaviour you test, and reading the spec instead risks testing behaviour
another packet owns.

### 2. Name the coverage gap as a behaviour, before writing any test

State precisely which module, behaviour, and conditions are untested or undertested — in terms of
*behaviour the caller cares about*, not lines or files. *Why:* a gap phrased as "this file is 40%
covered" produces shallow tests that chase the percentage; a gap phrased as "the retry path does not
back off on the third failure" produces a test that catches a real bug.

### 3. Confirm the owned paths

Verify your `write_surfaces` are a subset of the assigned obligations' `WRITES` surfaces — for a
`testing` task, the test files and any test-support surface, not production code. *Why:* this keeps
parallel `implement` packets write-disjoint (the owned-path rule; a violation is `SOL-O005`). If
making the behaviour testable would require editing production code outside your surfaces, stop:
that is a finding to promote upstream, not a surface to widen here.

### 4. Place each test per the project's conventions — do not guess layout

Follow the existing file-naming / directory / runner convention; if several exist, pick the one
closest to the code under test and document the choice. *Why:* a test in the wrong place is not
discovered or run — a green tick that never executes guards nothing while reading as coverage.

### 5. Test behaviour through the public surface, one reason to fail per test

Each test exercises the public behaviour of the obligation and asserts **one** specific outcome. Do
not reach into private methods or module-private state; do not bundle unrelated assertions. *Why:* a
test coupled to internals breaks on a behaviour-preserving refactor (a false failure); a bundled
test cannot tell the developer *what* broke.

### 6. Make every failure message say what behaviour broke

Use descriptive test names and, where the runner supports them, descriptive assertion messages.
*Why:* `AssertionError: expected true` tells the next developer nothing; a test's value is the
diagnosis it hands the person who broke it, not merely that it went red.

### 7. Keep every test deterministic

No ordering dependencies, timing assumptions, shared mutable state, unsandboxed network, or unseeded
randomness. *Why:* a flaky test trains developers to ignore failures — the worst outcome, because it
disarms every other test in the suite. (A test that already fails non-deterministically is a
*different* task kind — stabilise it under its own discipline, do not author a new flake here.)

### 8. Flip the assertion to prove each test means something

After writing each test: flip its assertion (or comment out the production path it exercises); run
that single test — it MUST fail. Restore — it MUST pass. Paste a representative sample of the
failing-then-passing transition into the trace. *Why:* without the flip, "the test passes" is
unfalsifiable from pasted output alone — the test could be tautological, fail for an unrelated
reason, or never run. The flip is the only evidence the test exercises the intended code path and
would fire if the behaviour regressed.

### 9. When a test is a criterion's oracle, prove it fires for the right reason

If the test is the bound oracle for a spec acceptance criterion (a `test` binding), the flip is
*necessary but not sufficient*: it shows the test fires, not that it fires for the criterion's
reason. Map the test to the criterion and confirm it asserts the behaviour the criterion describes
and fails when *that criterion* is violated — not when an adjacent passing condition changes. *Why:*
a single concrete example is a weak oracle — a test can pass against behaviour the criterion did not
intend (the test-oracle problem the proof-strength order and oracle adequacy, both in
the `verify` step, guard).
If no fail-when-violated test can be built, that is a finding for the spec author (rebind the
criterion to `command` / `manual`), never a licence to ship a green-but-irrelevant test.

### 10. Where the obligation is high-consequence, strengthen the oracle — do not redefine it

For an obligation carrying `RISK high` or `RISK critical`, or for an `INVARIANT` (a universal
predicate one example cannot establish), a single concrete `test` is an *inadequate oracle*. Reach
for a property-based, metamorphic, or mutation-backed test, and record what the oracle exercised in
the `oracle_adequacy` record the trace already owns. *Why:* the cost of a missed defect on a
high-risk obligation outruns one example; a bare concrete test there is the `SOL-V011`
oracle-adequacy finding. This guide does **not** define `oracle_adequacy`, the proof-strength order,
or the `RISK` threshold — it points you at them; the spec fixes them.

### 11. Read coverage as a map, not a score

If a coverage report is available (`cmdCoverage` or the project's equivalent — ask the user if
undefined), use it to *find* untested behaviour, then write behaviour tests for what deserves one.
*Why:* the number is a diagnostic for where to look, never a target; optimising the percentage
produces tests that touch lines without exercising behaviour.

### 12. Run the suite, validate, and write the TRACE claims with pasted proof

Run `cmdTest` (the whole suite, to confirm the new tests pass and broke nothing) and `cmdValidate`;
paste both. Then for each assigned obligation emit a `TRACE` block: `IMPLEMENTS` the obligation ids
the tests cover, `PRESERVES` the `CONSTRAINT` / `INVARIANT` ids held, `CHANGED` the modified test
surfaces, and at least one `PROOF` line naming a verification reference plus its observed
`proof_result` (`passed | failed | blocked | unverified`). Paste the proof output **verbatim** — the
runner's last lines in a fenced block, unmodified, as data, no paraphrase and no Markdown styling.
*Why:* the verbatim paste closes the bypass where "it passed" is asserted but the command never ran;
`proof_result` is the *observed* outcome — the uppercase verdict it maps to is decided downstream at
`verify`/`review`, not here.

### 13. Promote what testing revealed

Writing tests routinely surfaces real bugs and hard-to-test designs. Every such discovery — a bug
the test exposed, production code too coupled to test cleanly, a missing acceptance criterion — gets
a `## Promotion queue` row with a target and status; all MUST be resolved before the task closes.
*Why:* a bug a test exposed is the highest-value finding the step can produce; unwritten, it is lost
the moment the session ends.

## Forced visible output

Compliance here is otherwise invisible — "I wrote the tests and they pass" reads identically whether
or not the tests exercise anything. So the hard gate is **pasted, verbatim, re-runnable** proof,
never a paraphrase and never a prediction:

- **The flip transition for every new test** — the test failing when its assertion is flipped (or
  the production path commented out) and passing when restored. This proves the test is not a
  tautology; a green tick without it proves nothing.
- **The suite and validation output** — `cmdTest` and `cmdValidate`, last lines minimum, fenced.

All pasted as data: the resolved command, the run, and the runner's pass/fail summary, unmodified —
no quoting, no Markdown styling, no inline annotation. A test with no pasted flip is unproven; a
"tests passed" with no pasted output is not a proof.

## Output contract

The `trace.md` and filled `task.md` together satisfy the spec contracts; this guide does not
redefine them. Two facts bound what this step records:

- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line referencing real,
  re-runnable output. A no-`PROOF` trace is the structural error `SOL-S014`; an
  `IMPLEMENTS` / `PRESERVES` naming an unknown obligation is the unbound cross-reference `SOL-M003`.
- The observed `proof_result` maps 1:1 to the downstream core verdict value
  (`passed → PASS`, `failed → FAIL`, `blocked → BLOCKED`, `unverified → UNVERIFIED`). **A `testing`
  pass only ever records this core observation.** The verdict has 7 values total — the 4 core plus
  the 3 lifecycle decorators (`WAIVED` / `STALE` / `CONTRADICTED`) — but the decorators are applied
  later at `review`, and the PASS decision is made by the profile-independent `verify` step, never
  here. The Test-Author stance may influence which proofs are *demanded* (and may escalate a weak
  oracle to a stronger one per the oracle-adequacy rule in
  the `verify` step); it never decides whether a run PASSes.

## What does not belong

- **In a test:** assertions on internal state or private methods; multiple unrelated behaviours
  bundled into one case; ordering, time-of-day, shared-state, network, or unseeded-randomness
  dependencies.
- **In a testing task:** chasing a coverage percentage; refactoring production code "while you're
  here" to ease testing without an authorising obligation (that is `SOL-O005` and a finding to
  promote); stabilising an existing flake (a different `task_kind`); fixing a production bug the
  tests exposed inline (promote it as a downstream `fix` guarded by the new test).
- **In the trace's decisions:** a criterion you could not test silently dropped — that halts and
  goes upstream as a rebind request, not into a decision log as a fait accompli.

## Anti-patterns

- ❌ Shipping a test with no flip ("it's green, it's fine") → flip every test's assertion and paste
  the fail-then-pass transition; a green tick alone is unfalsifiable.
- ❌ Asserting on private methods or internal state → exercise the public surface; an internals test
  breaks on a behaviour-preserving refactor.
- ❌ Bundling unrelated assertions into one case → split; one test, one reason to fail.
- ❌ Targeting "85% coverage" → coverage is a map to untested behaviour, not a score to hit.
- ❌ A criterion-bound test that passes for an adjacent reason → map it to the criterion and confirm
  it fails when *that criterion* is violated, not when something else changes.
- ❌ A single concrete `test` as the oracle for a `RISK high`/`INVARIANT` obligation → strengthen to
  property/metamorphic/mutation and record `oracle_adequacy` (`SOL-V011` otherwise).
- ❌ Editing production code to make a test easy → that inverts the dependency and lands outside your
  surfaces (`SOL-O005`); promote the hard-to-test design as a finding.
- ❌ "Tests passed" with no pasted output → paste the runner's last lines verbatim, fenced,
  unmodified.
- ❌ Leaving a flaky test flaky ("it usually passes") → a non-deterministic test disarms the suite;
  make it deterministic or surface it for stabilisation.

## Self-review delta

Before closing, confirm — and where a check applies, paste the evidence into the `task.md`
`## Self-review` block:

- **Did I do only this step?** Every change traces to an assigned obligation, or it is an
  `## Unassigned changes` row with a reason + authorizing ID or `none`. No production code touched
  without an authorising obligation.
- **Did I stay inside the owned paths?** No file outside the union of assigned `WRITES` surfaces
  touched (no `SOL-O005`).
- **Does every test fire?** Each new test failed when flipped and passed when restored, and the
  transition is pasted — not asserted from memory.
- **Behaviour over implementation?** Each test exercises the public surface and would survive a
  reasonable behaviour-preserving refactor; none asserts on internals.
- **Failure-mode clarity?** Each test fails for one reason, and its failure message says what
  behaviour broke.
- **Right reason for criterion-bound tests?** Every `test`-bound criterion's oracle asserts the
  criterion's behaviour and fails when that criterion is violated; high-risk/`INVARIANT` obligations
  carry an adequate oracle with `oracle_adequacy` recorded.
- **Deterministic?** No ordering, timing, shared-state, network, or randomness dependency that could
  flake under CI.
- **Are all promotion items resolved?** No bug the tests exposed, and no hard-to-test finding, left
  unpromoted.
- **Final adversarial step:** what behaviour is still untested that I should have covered? What
  break in the code would still pass my suite? Do not leave the work without this step.

When the Test-Author stance carries its own self-review checks, run those too — they add to these,
not replace them.

## Bundled resources

- `references/task-template.md` — a fillable testing-task frame (coverage gap, a test-cases table
  keyed by behaviour, a test-placement table, a progress checklist with the flip step, and a
  self-review hard gate). It scores on the multi-stage-plan, state-separate-from-deliverable, and
  paste-output-gate criteria, so it ships a template. Instantiate it into your local task file,
  resolve the `cmd*` slots from `AGENTS.md > Commands` (asking the user for any undefined slot,
  including a coverage or single-test runner), and fill it as you work.
