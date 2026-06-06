# {{title}}

## Metadata

- Slug: {{slug}}
- Pass: implement
- task_kind: fix (flaky test — oracle is a loop-run)
- Carrier profile: Builder (Skeptic sharpens)
- Created: {{createdAt}}
- Status: active

---

> 🎲 **FLAKY TEST SESSION** — Reproduce before fixing. Categorise. Fix the root
> cause, not the assertion. Reject sleep-as-fix and quarantine-as-fix. Verify with
> a loop-run, not a single green tick.
>
> **Commands:** the test command resolves via the consuming repo's `AGENTS.md`
> `cmdTest` slot. The loop-runner invocation (`--repeat=500`, a parallel matrix, a
> seed-pinned mode) is **not** in the standard `cmd*` contract — ask the user how
> the project loops a single test. If the slot is undefined, ask before declaring
> the reproduction reliable; a guessed loop produces a false signal.

---

## Objective

The single test (or test family) being stabilised, in one sentence. *Example:
"Stabilise `LoginFlow > redirects after auth`, which fails ~3% of CI runs."*

---

## Assigned obligations

(Pasted verbatim from the work packet — the REQ/CONSTRAINT/INVARIANT/INTERFACE
IDs this fix is scoped to. Scope is these IDs, nothing more.)

- ***

## Owned paths (write surfaces)

(From the packet's `write_surfaces`. A path outside the union of the assigned
obligations' WRITES is `SOL-O005` — stop and surface it, do not edit.)

- ***

---

## Linked evidence

- Test file: `<path>:<line>`
- Failing-run evidence that named it flaky (logs / CI links, most recent N):
  `<paths or URLs>`
- Related bug-report or downstream fix task (if applicable): `<path>`

---

## Test under stabilisation

- **Test:** `<path>:<test name>` · **Observed failure rate:** `<%>` (e.g. ~3% of
  CI runs)
- **First observed:** `<sha or date>` · **Currently quarantined?** yes / no

---

## Flake category

(Pick exactly one. Mixed-category flakes split into separate task files — each
category root-causes differently.)

- [ ] **Timing / ordering** — `setTimeout`, unbounded poll, operation-order
  assumption, or order-dependent shared fixture
- [ ] **Shared state** — module-level state, singleton caches, fixtures/rows
  mutated by sibling tests
- [ ] **Network / external service** — real HTTP, real DNS, unmocked clock, flaky
  test container
- [ ] **Randomness** — unmocked `Math.random`, unseeded UUID, unseeded shuffle
- [ ] **Time** — unmocked `Date.now`, time-of-day, DST boundary
- [ ] **Resource exhaustion** — file handles, ports, DB connections, memory under
  parallel runs
- [ ] **Environment** — locale, timezone, hostname, env vars, terminal width, ANSI

---

## Reproduction protocol

(The exact command run repeatedly to fire the flake. Replace with the project's
loop-runner per the `cmdTest` slot / the user — do not guess the loop mechanism.)

```bash
{{cmdTest}} --repeat=500 --testNamePattern="<test name>"
# or under load: parallel-runner -j 8 -- {{cmdTest}} --testNamePattern="<test name>"
```

| Target | Run-environment matrix | Conditions verified |
| --- | --- | --- |
| 500× local + 500× CI matrix | timezone, env vars, no network · parallel sibling tests, real network | |

---

## Reproduction evidence (the repro proof — paste verbatim)

(The loop-run output that fires the flake, showing **both** passes and failures.
Last 30 lines or the runner's pass/fail tally. Data, not paraphrase.)

```text
<paste>
```

- Loop runs: 500 · Failures observed: … · Failure rate: … % · Failure modes seen:
  assertion / error / hang

---

## Hypothesis tracker

(Each suspected cause is a row. State, verify, and — if rejected — record what the
failed attempt teaches the next one. The *Next adjustment* column is the verbal
reflection that carries forward across attempts.)

| # | Hypothesis | How to verify | State (`unverified` / `confirmed` / `rejected`) | Next adjustment (if rejected) |
| --- | --- | --- | --- | --- |
| 1 | … | … | unverified | — |

---

## Root cause

(One paragraph. The actual mechanism producing the flake. Cite `file:line`.
*Symptom* and *cause* must not be the same statement, and the cause is never the
assertion.)

- **Symptom:** `<what fails, where>` — `<file>:<line>`
- **Cause:** `<the actual mechanism>` — `<file>:<line>`

---

## Plan

1. Reproduce the flake using the protocol above; record the failure rate
2. Categorise the source; pick exactly one category
3. Form hypotheses; verify each by altering one variable at a time
4. Find the root cause in production code or test setup (never the assertion)
5. Apply the fix; document the cause inline
6. Verify with a loop-run of the same shape that reproduced the flake
7. If the root cause is in production code, promote a downstream fix task — do not
   patch production code from inside this packet unless it is in the owned paths

---

## Progress checklist

- [ ] Flake reproduced (failure rate measured); repro proof pasted
- [ ] Category identified (exactly one)
- [ ] Hypotheses tracked; each verified or rejected with evidence
- [ ] Root cause identified at `file:line` (not the assertion)
- [ ] Fix targets the cause; no sleep/timeout-bump (unless contractual), no
      try/catch swallow, no widened assertion, no quarantine
- [ ] Inline note added so the failure mode is recognisable next time
- [ ] Verification loop-run executed (same shape that reproduced); all runs pass
- [ ] If cause is in production code, a downstream fix task surfaced on the
      promotion queue
- [ ] TRACE claims written; every `IMPLEMENTS` has a `PROOF` line with pasted
      output
- [ ] Self-review answered

---

## Fix evidence (the fix proof — paste verbatim)

(The verification loop-run output after the fix. Last lines or pass/fail tally.)

```text
<paste>
```

- Loop runs after fix: 500 · Failures: 0 · Failure rate: 0% · Stability gain:
  from `<%>` to 0

---

## Implementation or pass trace

(The `TRACE` block(s). Each `IMPLEMENTS` the REQ ids satisfied; `PRESERVES` the
CONSTRAINT/INVARIANT ids held; `CHANGED` the modified surfaces; at least one
`PROOF` line naming the loop-run binding and its observed `proof_result`.)

- ***

## Verification matrix

| Obligation ID | Required proof | Actual proof (loop-run) | proof_result |
| --- | --- | --- | --- |
| … | loop-run, all passing | `## Fix evidence` paste | passed / failed / blocked / unverified |

> `passed` only when every looped run passes; one failure among many is `failed`;
> a flake that could not be looped (no loop-runner, an environmental block) is
> `blocked` — never a silent `passed`. The verdict mapping and the PASS decision
> are made downstream at `verify`/`review`, not here.

---

## Unassigned changes

(Each change not traceable to an assigned obligation — with a reason + authorizing
ID, or `none`.)

- none

## Promotion queue

(Every discovery outside scope — typically a downstream fix task for a
production-code race, or a codebase-wide audit if the flake category recurs.
Target + status. All MUST be resolved before close.)

- ***

---

## Decisions

(Significant choices made during stabilisation — e.g. mocking the system clock vs
seeding random.)

- ***

## Findings

(Codebase discoveries worth preserving — e.g. a sibling test touching the same
shared state, an unmocked dependency probably affecting other tests. Promote
durable findings before close.)

- *** [pending]

---

## Blockers

- *** (anything preventing confident progress; a flake resisting 1000×
  reproduction goes here with the conditions already tried)

## Next steps

- *** (concrete starting points if incomplete; typically the downstream fix task
  for a production-code race)

---

## Self-review

> **Hard gate.** The task is not complete until every question below has a written
> answer directly beneath it. An unanswered question is a skipped check.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` →
- Reproduction loop-run (last 30 lines / pass-fail tally) →
- Verification loop-run after fix (last 30 lines / pass-fail tally) →

### Reproduced first

- Flake reproduced before any fix attempt — over how many loop runs, at what
  failure rate, under conditions no easier than where it originally failed?
  Answer:

### Categorisation

- Flake category named exactly (one of the seven)? Any mixed-category flake split?
  Answer:

### Root cause vs symptom

- Is the patch on the *cause* or the *symptom*? Any "fix the assertion"
  temptation rejected?
  Answer:

### Sleep / quarantine / swallow rejection

- Fix avoids `sleep`, timeout-bumps, try/catch swallow, widened assertion, and
  quarantine? If a wait was used, on which documented async contract?
  Answer:

### Fix proof

- Loop-run of the same shape that reproduced the flake passed with zero failures?
  Output pasted into `## Fix evidence`?
  Answer:

### Inline documentation + handoff

- One-line note at the cause site naming the failure mode? If the cause is in
  production code, downstream fix task promoted with the now-stable test as its
  regression guard?
  Answer:

### Scope and surfaces

- Every change traces to an assigned obligation? No file outside the assigned
  write surfaces touched (no `SOL-O005`)?
  Answer:

### Final polish

- "Did I actually verify with a loop-run, or did I get one green tick and call it
  done?"
  Answer:
