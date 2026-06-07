---
name: empirical-proof
type: fragment
pass: [verify, review]
description: >
  Bind every completion claim to real proof: resolve each `VERIFY BY` to a `cmd*` adapter, run it,
  paste verbatim command, exit, summary into the `VERDICT`'s `EVIDENCE`. ALWAYS apply when a
  `verify`/`review` pass records a `VERDICT` against a `VERIFY BY`, when a pass asserts how code
  behaves, or when recording a `PASS`/`FAIL`. Reject a bare "tests passed", schema-valid output,
  a paraphrase, a stale pre-edit run, or a reviewer trusting the worker's paste. Skip when a pass
  authors/analyzes a `*.swarm.md` without running anything (lint, improve, lower, decompose), or
  judges no behavioural claim.
---

# Step guide: empirical-proof (cross-cutting fragment)

> **Fragment, not a standalone step guide.** One of the two cross-cutting fragments: a
> step-guide-shaped module that the `verify` and `review` step guides *compose*,
> never a guide a `task.md` `task_kind` names on its own. A step guide loads it; a task does not
> activate it directly.
>
> **It owns no semantics.** The nine proof types, the seven-value verdict model, the
> proof-strength order, the merge gate, oracle adequacy, and "what is NOT a proof" are fixed by the
> proofs/verdicts reference card (`reference/proofs.md`, shipped — load it for the exact rules) and the
> upstream verify/review manuals (the `verify` step, the `review` step). Every term below
> is *cited*, not redefined; where this fragment and the reference disagree, the reference governs.
> This is the *procedure* for a discipline those layers own — SOFT control: a markdown contract that
> makes a skipped proof *conspicuous*, not a runtime that enforces closure (Swarm ships no runtime).

## Do this

For every required `VERIFY BY` binding of every in-scope obligation: resolve it to a real command,
run it against the change under judgment, paste the verbatim output into the `EVIDENCE` of its
`VERDICT`. No paste, no `PASS`. The numbered procedure below is that loop; the rules carry their WHY
so you can extend them to a case this file did not foresee.

## Purpose

Eliminate hallucinated completion. A model is a pattern-completer, and the pattern of a "finished
task" includes confident language ("all tests pass", "looks correct") it emits *regardless* of
whether the claim is true. The structural defence is forced visible output: a `PASS` cannot be
recorded without first pasting the real, re-runnable output the bound proof produced. This is the
canonical instance of the Swarm-wide rule — *if a step's compliance is otherwise invisible, require
it to emit a marker the next reader can see* — because a verification step that yields only "it
passed" is the easiest to drop unnoticed. The governing invariant is **CODE IS REALITY**: a
proof may falsify an obligation but never silently amend its intent, and **schema-valid output is
not a proof — shape is not truth** (see the `verify` step).

## Consumes

- **Each obligation's `VERIFY BY` binding(s)** — typed `proof_type[:test_scope]:adapter:artifact[#selector]`
  (the `verify` step). The `<proof_type>` is one of the **nine** closed types
  (the `verify` step); the `<adapter>` is a
  `cmd*` slot resolved through `AGENTS.md > Commands`. This fragment reads these; it defines
  neither the type set nor the resolution rule.
- **The `AGENTS.md > Commands` table** — the `cmd*` slots that *are* the adapters: cmdTest,
  cmdLint, cmdTypecheck, cmdBenchmark, cmdValidate, cmdFormat (plus project-named slots like
  cmdContract / cmdSecurity). If a binding's adapter has no matching row, the proof is not executable
  (`SOL-V002`, see the SOL error catalogue) and surfaces as `BLOCKED`, never `PASS` —
  say so and **ask the user**; do not guess a command.
- **The obligation's `RISK`** (the SOL reference) where present — it sets how strong an
  oracle the obligation demands (the `verify` step). This fragment routes to the
  adequacy record; it does not own the RISK→oracle table.

## Produces

- **The pasted, verbatim output backing each `VERDICT`'s `EVIDENCE` clause** (the `review` step):
  the resolved command, its exit condition, and the runner's summary line(s) — never a paraphrase.
- **For `RISK high`/`critical` obligations, a pointer to the `oracle_adequacy` record** the verify
  step requires (the `verify` step) — *what the oracle exercised relative to the
  obligation*, not merely that a command exited zero. This fragment does not define the adequacy
  schema (the `verify` step owns it); it makes the recorded footprint truthful so the
  record fills honestly.

This fragment produces **no** `verdict.md` — there is none. Verdicts live in `review.md`, which *is*
the verdict container (the `review` step); this fragment fills the `EVIDENCE` of the
blocks recorded there. It defines no new block, modal, verdict value, proof type, or lint code.

## Preserves

Three things separate a real proof from a plausible one:

- **The exact bytes of the run.** Output is pasted as data into a fenced block: no quoting, no
  Markdown styling, no annotation injected mid-paste, no truncation that hides the summary.
- **One proof per claim.** Each required `VERIFY BY` binding yields exactly one `VERDICT`
  (the `verify` step);
  each claim ("the linter is clean", "the regression reproduces the defect", "no boundary violation")
  binds to its own paste. Bundling claims into one "all good" hides which check actually ran.
- **Freshness.** A proof pasted before a later edit is stale and no longer backs the claim. The
  evidence path couples a proof to the surfaces it exercised (see the `verify` step); a
  change to an exercised surface invalidates the prior `PASS` (decorates `STALE`).

## Procedure

1. **Resolve the binding to a real command.** For each required `VERIFY BY`, read its
   `proof_type[:scope]:adapter:artifact` and look the `<adapter>` up in `AGENTS.md > Commands`. If
   the slot is undefined or missing, do not invent one: record the binding as
   not-executable (`SOL-V002` / `BLOCKED`, not `PASS`) and ask the user for the command. *Why:* a
   guessed command proves nothing about the project's real suite, and the binding is portable only
   because the command lives in the consumer's `AGENTS.md`, not here.
2. **Run it, in the right place.** Execute the resolved command against the change under judgment. In
   a `review` step, run it *yourself* in your own worktree with the worker's branch checked out — the
   worker's paste is evidence the command ran at some past moment, not that it passes now; only your
   own run satisfies the gate (the implementer MUST NOT render the verdict; see
   the `review` step). *Why:* trusting
   an upstream paste re-introduces the unverified-claim failure this fragment exists to close.
3. **Paste the output verbatim.** Put the resolved command, its exit condition, and the runner's
   summary line(s) into a fenced block in the `VERDICT`'s `EVIDENCE`. Treat output as data — copy it
   in, leave it alone. *Why:* a paraphrase ("all green") is unfalsifiable from the document; the raw
   block is what a later reader can re-check — the whole point of forcing the marker.
4. **One paste per binding.** Record exactly one `VERDICT` per required binding
   (the `verify` step); do not
   collapse several into one "all checks pass" paste. *Why:* the gate expects N verdicts for N
   bindings, and a missing one is `SOL-V008` / `UNVERIFIED` — a bundled paste hides which binding
   went unjudged.
5. **Record what the oracle exercised, where required.** For a `RISK high`/`critical` obligation a
   single concrete `test` is an inadequate oracle (the `verify` step): point the
   `oracle_adequacy` record (the `verify` step) at the real run — the surfaces it
   touched (the evidence path) plus any
   mutation/metamorphic/property/coverage evidence that the example-based oracle is hard to fool.
   *Why:* "the proof passed" is necessary but not sufficient — a `PASS` against a weak oracle can
   still be wrong; this fragment decides no threshold, it makes the recorded footprint honest so the
   threshold check has something true to read.
6. **Re-run after every change.** Edit anything after pasting a proof and the proof is stale: re-run
   and re-paste. *Why:* freshness is bound to the evidence path (see the `verify` step) —
   this fires repeatedly during refactor and migration work where validation recurs per wave/checkpoint.
7. **On a failed or unrunnable proof, do not soften the verdict.** `FAIL` is `FAIL`; a proof that
   could not run is `BLOCKED` (truth *unknown*), never `PASS`; if you cannot tell whether a proof
   *ran and was prevented* versus *was never attempted*, record `UNVERIFIED` — the weaker, more honest
   claim (the `review` step). A failing obligation is accepted only by a `WAIVED` verdict carrying
   authority + reason + expiry, and the implementing agent MUST NOT self-issue it (see
   the `review` step) — that
   authority is a human or the spec owner. *Why:* an environmental block silently marked complete is
   the same hallucinated-completion failure wearing a different mask.

## Output contract

Every `PASS` this fragment backs carries an `EVIDENCE` clause pointing at a real, re-runnable run,
output pasted verbatim. Concretely:

- **Good** — verbatim, fenced, with the resolved command, exit, and the runner's summary:

  ````markdown
  VERDICT AC-001: PASS
  EVIDENCE test:unit:cmdTest:auth-refresh-expired-token#clears_session

  ```
  $ <resolved cmdTest command>
  Tests:       189 passed, 189 total
  Time:        4.832 s, exit 0
  ```
  ````

- **Bad** — paraphrased ("Validation: everything passes", "All 189 tests green"). The paraphrase is
  *plausible* and might even be *true*, but it is unverified: it does not satisfy the gate (see
  the `verify` step).

## Refuses

These MUST NOT yield `PASS`. The closed list is owned by the `verify` step — this is
the rejection contract that *applies* it, it does not extend it:

- **Schema-valid output is not a proof.** Well-formed JSON, or a structured-output call validating
  against its schema, says nothing about whether the *value* is correct (see
  the `verify` step, the `review` step). A binding
  whose only evidence is "output matched the schema" is `UNVERIFIED`.
- **"Tests passed" without output is not a proof.** A `PASS` whose `EVIDENCE` is the bare phrase —
  no command, no exit code, no run output, no selector resolution — is `UNVERIFIED`; a valid
  review MUST reject it (see the `verify` step). The prohibition rides the production
  side too: an `implement` TRACE's `PROOF` line MUST reference real output, and an unqualified
  "tests passed" is not admissible there either.
- **A `manual` verdict without recorded reasoning is not a proof.** `manual` is the honest escape
  hatch (the `verify` step), not a blank cheque: it MUST carry a `REASON` and an
  `EVIDENCE` ref to the recorded judgment, and (per the `review` step) a recorded
  judge identity, an independent reviewer, and — for
  `RISK high`/`critical` — dual judgment. A bare `manual PASS` is `UNVERIFIED`.
- **A prediction is not a run.** "should pass", "expected to work", "tests should be green", "obvious
  from the diff" — none is a recorded run. A diff does not execute tests.
- **A reviewer trusting the worker's paste is not a proof** (see the `review` step).
  Re-run it yourself; an upstream paste is a past moment, not the present verdict.

## Common evasions and the response

The agent (or user) reasoning toward one of these should paste the response and run the proof —
making *skipping* the verification cost a visible exchange, not winning an argument.

| 🚩 Evasion                                                | Response                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| "I already ran it earlier in the session."               | Re-run after every change; the earlier run is stale (see verify).                 |
| "It's obvious from the diff that the test passes."       | A diff does not run tests. Run them; paste the output.                            |
| "Schema validated, so the output is correct."            | Shape is not truth (see verify). A schema match is not a proof.                   |
| "The CI will catch it."                                  | The discipline is the agent's gate, not the CI's.                                |
| "The output is too long to paste."                       | Paste the resolved command and the runner's summary line(s), not the whole log.  |
| "I'm reviewing in good faith — pasting is ceremony."     | Trust is a vulnerability to remove, not a virtue; run it yourself (see review).   |
| "The command failed for unrelated environmental reasons." | That is `BLOCKED`, surfaced as a blocker — never a silent `PASS` (see review).    |

The full catalogue (including these) is in `references/evasions.md`; pull it up when one surfaces.

## Type-specific applications

The proof discipline is universal; each `task_kind` (the `implement` step)
emphasises a different proof per its
default suite (the `verify` step — the authority for which proofs SHOULD bind; this
is only where the paste lands):

- **fix** — the regression test reproducing the defect, then passing after the fix.
- **refactor / migration** — per-wave/per-checkpoint validation and behaviour-preservation output.
- **performance** — baseline and target benchmark output under the *same* protocol.
- **testing** — the test pass plus an assertion-flip (the test fails when the behaviour is broken).
- **documentation** — every code example actually run, output pasted.
- **review** — the bound proofs re-run by the reviewer in their own worktree (see the `review` step).

## Self-review delta

When this fragment composes into a step, the step's self-review additionally confirms:

- Every completion claim in scope maps to an independent, pasted, re-runnable proof — none rests on
  the model's say-so (every completion claim maps to independent verification; see
  the `review` step).
- No `PASS` is backed only by schema-valid output, a bare "tests passed", a prediction, or a
  reasoning-less `manual` verdict (see the `verify` step).
- Each required `VERIFY BY` binding has exactly one `VERDICT` with its own pasted output; no claims
  are bundled (see the `verify` step), and no required binding is left without a
  verdict (`SOL-V008`).
- No pasted proof predates a later edit (re-run-after-change; staleness via the evidence path; see
  the `verify` step).
- In a `review` step, the bound `cmd*` proofs were re-run by the reviewer, not trusted from upstream
  (see the `review` step).
- For `RISK high`/`critical` obligations, the `oracle_adequacy` record reflects what the oracle
  actually exercised (see the `verify` step).
- Every `BLOCKED`/`UNVERIFIED` is recorded as such rather than rounded up to `PASS`, and any
  not-executable binding names the missing `cmd*` slot rather than a guessed command.

## Bundled resources

- `references/evasions.md` — the full catalogue of evasions and responses (the table above keeps the
  most frequent ones inline; the rest live there).
