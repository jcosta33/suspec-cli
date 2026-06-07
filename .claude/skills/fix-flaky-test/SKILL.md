---
type: pass-guide
name: fix-flaky-test
pass: implement
activates_for_task_kind:
  - fix
description: >-
  Run an `implement` pass on a `fix` whose oracle is a loop-run — a flaky,
  non-deterministic test. ALWAYS apply when a `fix` test passes sometimes and
  fails sometimes, when CI shows occasional failures of the same test, when a
  test is `.skip`'d/quarantined for flakiness, or for "passes locally, fails in
  CI" — even without the word "flaky". Never fix by re-run-to-green, a sleep, a
  timeout bump, try/catch, a widened assertion, or quarantine. Skip deterministic
  failures (one failing 100% of the time is a regression `fix` or a `feature`),
  authoring new tests, and any non-`fix` task kind.
---

# Step guide: implement — fix (flaky test)

> **Scope of this file.** A *step guide*: the `fix` branch of the `implement`
> pass, narrowed to a non-deterministic failing test. It documents *how* to
> stabilise a flake; it does **not** redefine `VERDICT`, the proof taxonomy, the
> proof-strength order, the proof_result→verdict mapping, or any load-bearing
> meaning — those are fixed by the SOL/structured-form language references and applied here,
> never restated. Where this guide and the spec disagree, the spec governs. A
> step guide is SOFT control: it influences how an agent works; it constrains
> nothing.
>
> Carrier profile: **Builder**; the **Skeptic** stance is the natural sharpener
> for a flake (assume the test passed by luck until a loop-run proves otherwise).
> If a Skeptic profile is active, run its own self-review delta too — it adds
> checks, it does not replace these.

## Purpose

Stop the most tempting non-fix in software: re-running a test until it goes
green, calling it fixed, and shipping the bug. A flaky test fails
non-deterministically — green sometimes, red sometimes, usually worse under CI
load than locally. The flake is a **real** signal about the system: ordering,
timing, shared state, or resource coupling. The only acceptable resolution is to
reproduce it, characterise the nondeterminism, fix the root cause, and prove the
fix by re-running the *bound* test under the conditions in which it failed. A
`PASS` cannot be recorded until the fix proof shows every looped run passing.

This guide stabilises an **existing** test. Read `## Skip for` first — a test
that fails every time after a change is a different problem, not a flake.

## Skip for

A flaky `fix` is narrow. Do not load this branch for territory elsewhere; each
matches a different `task_kind` or a different `fix`:

- **A deterministic failure.** "Test fails 100% of the time after my change" is
  an ordinary regression `fix` (reproduce → patch root cause → assertion-flip
  proof), or a `feature` if the expected behaviour changed. Nothing
  non-deterministic to loop.
- **Authoring a new test from scratch.** That is a `testing` task kind; this
  branch stabilises a test that already exists and already named itself flaky.
- **Feature work whose tests fail.** Tests failing because the behaviour is not
  yet built is a `feature` task, not stabilisation.
- **Any non-`fix` task kind** (refactor, rewrite, migration, performance,
  documentation). Those have their own `implement` branches.

## Consumes

- One `task.md` work packet (the structured packet `decompose` handed you), naming
  `pass: implement`, `task_kind: fix`. Read the assigned obligations pasted
  verbatim, the `write_surfaces` (your owned paths), the `verification_bindings`,
  and the constraints/invariants to preserve — `implement` works against the
  packet, not the surface spec or the structured form.
- The flaky test under judgment plus the failing-run evidence that named it
  flaky — the symptom, not yet the cause. Also the conditions under which it last
  fired (CI vs local, parallel siblings, load, seed, clock); these get
  reproduced too.
- The project's test command, resolved through the consuming repo's `AGENTS.md`
  `cmdTest` slot. A flake is reproduced by **looping** a single test, and the
  loop-runner ("run this test 500×", a single-thread or seed-pinned mode, a CI
  matrix) is **not** in the standard `cmd*` contract. If the project's loop
  mechanism is undefined, ask the user how the project loops one test — do **not**
  guess; a guessed loop produces a false signal about reproduction.

## Produces

- The pasted, verbatim loop-run output that **reproduces** the flake — proof the
  nondeterminism is real and characterised, not a one-off.
- The root-cause diagnosis: which category of nondeterminism, and where in
  production code or test setup it lives (never in the assertion).
- The fix, plus the pasted loop-run output that **proves** it — the same test,
  looped under the conditions in which it failed, all runs passing.
- An inline one-liner at the cause site naming the failure mode (e.g.
  `// session id is seeded; do not draw it from a global RNG here`) so it is
  recognisable next time.
- The standard `implement` outputs: `TRACE` claims (`IMPLEMENTS` / `PRESERVES` /
  `CHANGED` / at least one `PROOF` line with its observed `proof_result`),
  provenance fields, and a resolved promotion queue. Where the root cause is in
  production code (a race, an unhandled rejection, a resource leak), a hand-off:
  this work produces the diagnosis and the now-stable test as that fix's
  regression guard; the production fix is a separate downstream task.

## Preserves

- **The signal.** The flake says something true about the system. The fix removes
  the cause, not the message — the test still fails when the behaviour it guards
  is actually broken.
- **The bound oracle.** The test that named the flake is the test that proves the
  fix. The proof binds to *that* test, re-run, not a fresh or weakened
  substitute.
- **Determinism.** After the fix, the test's outcome is a function of the code
  under test, not of ordering, scheduling, the clock, or a shared neighbour.
- **Only the assigned obligations and owned paths.** Any change not traceable to
  an assigned obligation is an `## Unassigned changes` row, not a silent edit.
  Touching a file outside the union of the assigned obligations' write surfaces
  is the owned-path violation (the write-surface rule in
  `decompose`, lint code `SOL-O005`) — stop and surface it.

## Rejects

These MUST NOT yield a `PASS`. Each suppresses the signal instead of acting on
it; the rationale is why, not just that:

- **Re-run until green.** "It passed on the third try" is the bug, not the fix —
  observing a flake pass once proves only that its failure rate is below 100%.
- **Add a sleep / bump the timeout.** The race is still there; a wider window just
  loses less often. Waiting is acceptable *only* when timing is part of a
  documented async contract — and then you wait on the contract (a settled state,
  an emitted event), never on a hope.
- **Quarantine as the resolution.** `.skip`, mark-as-allowed-to-fail, or a
  conditional `it.if(env)` is containment — keeping the suite honest *while* a
  real fix is investigated — never the fix. Without an owner and a date it
  becomes a permanently disabled test.
- **Widen the assertion.** Loosening a check because the value drifts (asserting
  "greater than zero" where it should be exact) masks the bug behind a check too
  weak to fire.
- **Fix the assertion instead of the cause.** The assertion is the messenger;
  editing it to accommodate the nondeterminism hides the defect, not removes it.
- **Swallow it in try/catch.** Catching the error on the source of nondeterminism
  suppresses the assertion's signal — the same as widening it, by another route.
- **A repro you could not actually reproduce.** A flake that will not fire under
  looping is *un-isolated*, not *unreal*. Declaring it fixed without ever
  reproducing it is unfalsifiable — the fix has nothing to prove against.

## Procedure

Run the `implement` spine (read the packet not the spec; confirm owned paths;
halt on ambiguity; write TRACE claims with pasted `PROOF`; record provenance;
resolve the promotion queue; self-review) and, inside step 4 of that spine, run
the flaky-specific branch below.

1. **Reproduce before you claim to understand.** Loop the test until it fires
   (typically 100×, often 500×–1000× for low-frequency flakes), then loop enough
   to trust the failure rate you observe. If it will not reproduce, broaden the
   conditions — CI-like load, sibling tests alongside, pin or vary the seed,
   advance the clock — rather than concluding it was never real. Paste the
   loop-run output showing **both** passes and failures: that is the repro proof.
   *Why:* a diagnosis without a reproduction is a guess; the loop makes "I
   understand it" falsifiable.
2. **Characterise the nondeterminism.** Name the category, because the category
   narrows the fix:
   - **Timing / ordering** — depends on a `setTimeout`, an unbounded poll, or
     assumes operation A finishes before B; or depends on the order tests/ops run
     in (a shared fixture left dirty by an earlier test, an unsorted collection
     iterated as if ordered).
   - **Shared state** — a global, a singleton, a module-level cache, a database
     row, or a temp file that one test mutates and another reads.
   - **Network / external service** — real HTTP, real DNS, an unmocked clock, a
     flaky test container.
   - **Randomness** — unmocked `Math.random`, unseeded UUID generation, unseeded
     shuffles.
   - **Time** — unmocked `Date.now`, time-of-day-dependent assertions, DST
     boundaries.
   - **Resource exhaustion** — ports, file handles, memory, connection-pool
     slots, disk, or a rate limit that bites only under load.
   - **Environment** — locale, timezone, hostname, env vars, `NODE_ENV`,
     terminal width, ANSI.
   A flake that mixes categories is **split into separate fixes** — each category
   root-causes differently, and one fix claiming to cover two is one of them
   masked.
3. **Find the root cause in production code or test setup, not in the
   assertion.** The cause lives in nondeterministic production code (un-seeded
   random, un-mocked time, a race), un-isolated setup/teardown (shared state not
   reset), the parallel-runner harness (siblings on a shared resource), or the
   environment. Trace from the reproduced failure to the line that introduces the
   nondeterminism. *Why:* the assertion is the messenger; editing it accommodates
   the flake instead of removing it.
4. **Fix the cause; never mask it.** Make the outcome deterministic at the
   source: inject the clock or the RNG seed instead of reading the real one;
   isolate the shared state (fresh fixture per test, scoped teardown); wait on the
   actual contract instead of a sleep; reserve or release the contended resource
   correctly. Do not reach for the shortcuts in `## Rejects` — they move the
   flake, not remove it.
5. **Prove the fix with the bound test, re-run.** Loop the *same* test, under the
   conditions in which the flake reproduced, enough to trust the result — every
   run passing. Paste the loop-run output verbatim. *Why:* a flake reproduced
   once and fixed once is not a flake proven fixed; the loop is the only proof
   that the failure rate is now zero, not merely low.
6. **Document the cause inline.** Leave a one-liner at the cause site naming the
   failure mode, so the next reader recognises it before reintroducing it.
7. **Hand off a production cause downstream.** If the root cause is a real
   production bug (a race, an unhandled rejection, a resource leak), this work
   produces the diagnosis and the now-stable test; the production fix is a
   separate downstream `fix` task guarded by that test. Promote it on the
   promotion queue rather than bundling it.

## Forced visible output

Compliance here is otherwise invisible — "I think it's fixed" reads the same
whether or not the loop ran. So two pasted, verbatim, re-runnable proofs against
the bound test are the hard gate, never a paraphrase or a prediction:

- **The repro proof** — the test, looped, failing non-deterministically *before*
  the fix (both steps and failures visible, plus the failure rate).
- **The fix proof** — the same test, looped under the conditions in which it
  failed, *all* runs passing *after* the fix.

Both pasted as data into fenced blocks: the resolved loop command, the run, and
the runner's pass/fail tally (last lines minimum), unmodified — no quoting, no
Markdown styling, no inline annotation. A run with no pasted output is not a
proof; a green tick without the tally is not a proof.

## Output contract

This guide defines no new block, verdict value, proof type, or lint code; the
repro and fix proofs land in the trace and verdict containers the `implement` and
`verify` steps already own.

- Each `TRACE` claiming `IMPLEMENTS` MUST carry at least one `PROOF` line; a
  no-`PROOF` trace is a structural parse error (`SOL-S014`), not a soft lint. An
  `IMPLEMENTS`/`PRESERVES` naming an unknown obligation is `SOL-M003`.
- `implement` records only the **observed** `proof_result`, which maps 1:1 to a
  core verdict value: `passed → PASS`, `failed → FAIL`, `blocked → BLOCKED`,
  `unverified → UNVERIFIED`. The full verdict has 7 values (4 core + the 3
  lifecycle decorators `WAIVED` / `STALE` / `CONTRADICTED`), but the decorators
  apply later at `review` and the `PASS` decision is made by the
  profile-independent `verify` step — never recorded here.
- For a flake, the observed result is `passed` **only** when the fix proof shows
  every looped run passing; a single failure among many is `failed`; a flake that
  could not be looped (no defined loop-runner, an environmental block) is
  `blocked` — never a silent `passed`.

## Self-review delta

Before closing, confirm — and paste the evidence into the `task.md`
`## Self-review` block where a check demands output:

- **Reproduced first?** The repro proof is pasted, and the flake was reproduced
  under conditions no easier than those it originally failed under.
- **Category named?** The category of nondeterminism is named (timing/ordering,
  shared state, network/external, randomness, time, resource, environment), and
  any mixed-category flake was split.
- **Root cause, not symptom?** The fix removed the cause in production code or
  test setup — not in the assertion, not by a sleep, a timeout bump, a widened
  check, a try/catch swallow, or quarantine.
- **Fix proof pasted?** The same bound test, looped under the failing conditions,
  every run passing — not a single step.
- **Documented and handed off?** The cause is documented inline, and any
  production-side root cause was promoted as a downstream fix with the stabilised
  test as its regression guard.
- **Inside scope and surfaces?** Every change traces to an assigned obligation,
  and no file outside the union of assigned write surfaces was touched (no
  `SOL-O005`).

## Anti-patterns

Meet the reasoning toward any of these by running the loop and pasting the
output — make skipping reproduction a visible cost, not an argument to win.

| 🚩 Evasion | Response |
| --- | --- |
| "It passed when I re-ran it, so it's fixed." | A step after a re-run is the bug, not the fix. Loop it and prove it. |
| "I added a small sleep and it stopped failing." | The race is still there; the window just got wider. Wait on the contract or fix the cause. |
| "I can't reproduce it, so there's nothing to fix." | It is un-isolated, not unreal. Broaden conditions: load, parallel siblings, seed, clock. |
| "I loosened the assertion so it tolerates the drift." | A check too weak to fire isn't a proof. Fix what makes the value drift. |
| "I wrapped the flaky call in try/catch." | Swallowing the error suppresses the assertion's signal — same as widening it. |
| "I marked it skipped to keep CI green." | That is containment with an owner and a date — not the fix. The cause is still live. |
| "The fix is obvious from the diff." | A diff does not loop the test. Loop it under the failing conditions; paste the output. |
| "It only flakes in CI, and I can't run CI locally." | Reproduce the CI conditions (load, parallelism, seed) or surface it as `blocked` — not a silent `passed`. |
| "Declared stable after one passing run." | The verification is loop-run output, not a single green tick. |

## Bundled resources

- `references/task-template.md` — the task-file scaffold for a flaky-test
  session: the flake-category field, the reproduction protocol and pasted repro
  evidence, the hypothesis tracker (with a Reflexion-shaped *Next adjustment*
  column so a rejected hypothesis teaches the next), the root-cause / fix evidence
  blocks, and the self-review hard gate.
