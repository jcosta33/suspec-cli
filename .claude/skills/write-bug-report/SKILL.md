---
name: write-bug-report
type: pass-guide
pass: author
activates_for_task_kind:
  - bug-report-writing
profile: bug-hunter
description: >-
  Author a diagnosis-only bug-report: reproduce the defect, isolate the root cause to
  file:line + state + input + caller, name the existing obligation it violates — no fix.
  ALWAYS apply on `pass: author` + `task_kind: bug-report-writing`, or when asked to report,
  diagnose, or root-cause a bug, regression, or unexpected behaviour, even if intermittent.
  Never write the fix, conflate symptom with cause, author obligation blocks, or finalise
  without a verbatim reproduction pasted. Skip when fixing the defect (downstream fix
  task), authoring a present-state audit, or writing a spec declaring intent.
---

# Step guide: write-bug-report (the `bug-report-writing` task_kind)

> **SOFT control.** *How* to author a bug-report. It does **not** define what a bug-report
> may assert, the diagnosis-only stance, the obligation-block grammar, or verification
> meaning — those are owned by the language reference and the artifact contract, **cited
> here, not redefined**. Where this guide and the reference disagree, the reference governs.
> A bug-report is the input to a downstream fix task; the fixer must patch from the report
> alone, with zero re-investigation.

## Stance: Bug Hunter

Run this step as a **Bug Hunter**: forensic, hypothesis-driven, **read-only on code**.
Mistrust your first plausible explanation — a wrong cause wastes the fixer's whole session
and lets the defect ship. Refute by default: when an explanation fits, try to disprove it,
don't write it down. *Why:* diagnosis and remedy are different mindsets with different
proofs and different failure modes; a combined "diagnose-and-fix" instinct short-circuits
diagnosis at the first fit. The split forces the diagnosis to stand on its own.

## Consumes

- The defect as reported — human ticket, agent observation, or CI failure — plus the code
  under investigation (read-only) and related sources.
- The reproduction command. A test-suite reproduction runs the project's test command (the
  `cmdTest` slot in the consuming repo's `AGENTS.md > Commands`); a runtime defect runs the
  run/start command. If `AGENTS.md` is missing or the slot undefined, **ask the user which
  command to run — do not guess.** A guessed command gives a false signal about whether the
  bug fires.

## Produces

A bug-report whose body, in order, is **Symptom · Reproduction · Root cause · Affected
obligations** — a defect record, not a remedy. The reproduction carries verbatim pasted
output; the root cause is a precise interaction; the affected-obligations section
references the violated obligation by id only and authors no new obligation. The report
promotes forward into a **fix task** (`task_kind: fix`, an `implement`-step input) — never
into a fix it dictates, never directly into code.

## Core rules

### 1. Reproduce before you explain

A bug is a hypothesis until reproduced. Re-run the reproduction and confirm the symptom
fires before writing a word about cause. If you cannot reproduce, *say so* and investigate
the discrepancy (versions, seeds, fixtures, data, clock, OS) — do not speculate about a
cause from a symptom you never saw fire. *Why:* the reproduction is the falsification
target for the whole report; without it, "the bug is X" has no possible counter-evidence.

### 2. Isolate to the smallest, most deterministic reproduction

Once it fires, narrow it: minimal input, minimal environment, fewest steps. The
reproduction in the final report is *the* reproduction; every attempt that did not repro is
noise — capture it in a reproduction-attempts history, but never lead with it. *Why:* the
fixer re-runs exactly what you hand them; a bloated reproduction makes them re-isolate the
bug you already isolated.

### 3. State the root cause as a precise interaction, never the symptom

The root cause is *file:line + what state combines with what input + which caller
mis-handles the result*. The symptom alone is not the cause.

- ❌ "The function returns null."
- ✅ "`getPricing()` (`src/billing/pricing-adapter.ts:42`) returns null when the cache is
  cold and the upstream call is rate-limited; the caller `quote.ts:88` interprets null as
  'fall back to default tier' instead of failing."

*Why:* a cause stated as a symptom recurs through a different path the moment the same
state is hit again; stated as an interaction, it tells the fixer exactly where the defect
lives and why.

### 4. Distinguish observation from inference

An **observation** is what the reproduction shows ("fires deterministically with
`NODE_ENV=production` and 12 MB input"). An **inference** is your explanation ("the proxy
is dropping bytes"). Both are useful; conflating them obscures the trail. Track each
candidate explanation in a hypothesis tracker with a status — `supports` / `disproven` /
`confirmed` — and the next adjustment to try. *Why:* writing disproven branches down turns
each dead end into a signal the next attempt (or the fixer) reads instead of re-exploring;
a confirmed cause backed by refuted alternatives is far stronger than one plausible guess.

### 5. Search for related defects by pattern, not just by file

For the root cause you found, search the codebase for the *pattern* — same call shape, same
null-handling, same missing guard — not only the one file. Note every related vulnerability,
even those out of scope for this defect. *Why:* a cause in one place usually exists in
several; surfacing the family lets the fix task widen scope or spawn a sibling report,
instead of fixing one instance and shipping the rest.

### 6. Propose the regression test, do not write the fix

Identify the test that would catch this regression: its location and the assertion it must
make against the reproduction's conditions. If the test framework makes that test hard to
write, note the gap as a finding. State the test *plan* only — writing the test is part of
the downstream fix. *Why:* naming the oracle the fix must satisfy makes the report
actionable without crossing into the remedy.

### 7. Prescribe no fix and author no obligation blocks

A bug-report names the cause; it does **not** state the patch, the diff, the remedy design,
or "the function should return X instead of null" — that remedy is owned by the downstream
fix task. The `## Affected obligations` section references the *existing* obligation the
defect violates (`<spec-id>#<REQ|CONSTRAINT|INVARIANT|INTERFACE>-NNN`) and how; it MUST NOT
author a new `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block. If no existing obligation
covers the broken behaviour, say so explicitly — that gap is itself a finding the promoted
fix task must reconcile, not a licence to declare the missing obligation here. *Why:*
declaring intent or dictating the patch crosses the diagnosis-only boundary; a defect
becomes binding intent only when authored into a spec, and the remedy is intent work with
its own proofs. A report that does either has stopped being a defect record.

### 8. Forced visible output: paste the failing reproduction verbatim

Do not finalise until the reproduction section holds the **exact command**, the **verbatim
failing output** (fenced, unedited, treated as data — no paraphrase, no "should reproduce"),
and a **determinism** note (fires every run / fires N of M runs / `[unable to reproduce]`).
An `[unable to reproduce]` is acceptable only with a written explanation of what was tried
in the attempts history. *Why:* asserting "the bug fires" without pasted output is the
silent-skip failure mode — the claim looks complete and was never run; the paste is the only
evidence the next reader can check.

## What does not belong

- **In a bug-report:** the fix — patch, diff, or remedy design. That is the downstream fix
  task (rule 7).
- **In `## Root cause`:** speculation. State only what the reproduction and code verify;
  unconfirmed explanations live in the hypothesis tracker with a status (rules 3–4).
- **In `## Affected obligations`:** a new obligation block, or behaviour the system "should"
  have. Reference the violated obligation by id, or record the coverage gap as a finding
  (rule 7).
- **In `## Reproduction`:** "should reproduce" or "in theory". Either it reproduces (paste
  it) or it is marked `[unable to reproduce]` with an explanation (rule 8).
- **In the filename:** the `.swarm.` infix. A bug-report is a working artifact named plain
  `.md`; the infix marks a Swarm-visible spec, which this is not.

## Anti-patterns

- ❌ Reporting the symptom as the bug ("module X is broken") → state the cause as a
  file:line + state + input + caller interaction (rule 3).
- ❌ Speculating about cause without reproducing → reproduce first; a non-reproducing bug is
  documented as such, not explained away (rule 1).
- ❌ "I can't reproduce it, must be environment-specific" → the discrepancy is itself a
  finding; investigate and surface it (rule 1).
- ❌ Conflating "I think this is the problem" with "I have proven this is the problem" →
  separate observation from inference; track unconfirmed explanations with a status (rule 4).
- ❌ Stopping at the first hypothesis that fits → push past it; record refuted alternatives so
  the report shows the cause survived scrutiny (rules 4, Bug Hunter stance).
- ❌ Skipping the related-defects search → grep the pattern, not just the file (rule 5).
- ❌ Prescribing the fix, the diff, or "should return X" → name the cause only; the remedy is
  the downstream fix task (rule 7).
- ❌ Authoring a `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block, or declaring the missing
  obligation when none covers the behaviour → reference the violated obligation by id, or
  record the gap as a finding (rule 7).
- ❌ "The bug fires" with no pasted command output → paste the verbatim failing output; shape
  is not proof (rule 8).

## Self-review

> **Hard gate.** Not finalisable until the reproduction section holds the exact command and
> its verbatim failing output (or an `[unable to reproduce]` with a written explanation).
> Close as a senior engineer about to hand this to a fixer — look for anything that could
> mislead them. Where a check produces output, paste it.

- [ ] **Read-only proof.** Only the report changed; no source file was touched. (A
  working-tree status is the proof — bug-report sessions do not patch code.)
- [ ] **Reproduction reliability.** The reproduction fired from a fresh checkout, the
  verbatim output is pasted, and the conditions (env, version, state) are documented. Did
  you run it, or describe what you think would happen?
- [ ] **Root-cause depth.** The cause is a specific file:line interaction with state and
  input — not the symptom. Would the bug recur via a different surface area if the cause is
  what you say?
- [ ] **Observation vs inference.** Every explanation is confirmed by the reproduction/code,
  or carried in the hypothesis tracker with a status and a next adjustment — none asserted as
  fact unproven.
- [ ] **Related defects.** You searched the *pattern* (same module, same call shape, same
  guard) and noted every related defect, even those out of scope.
- [ ] **Diagnosis-only boundary.** No patch, diff, or remedy design anywhere; no new
  obligation block authored; the affected obligation is referenced by id, or the coverage gap
  is recorded as a finding.
- [ ] **Fixer readiness.** A fixer could write the patch from this report alone, and the
  regression test that would catch a recurrence is identified (or its absence noted).

## Bundled resources

- `references/task-template.md` — a fillable `bug-report-writing` task frame: the workflow
  scaffold (metadata, the `AGENTS.md` command contract, constraints, progress checklist,
  decisions, and a self-review hard gate demanding pasted reproduction output) plus a
  `## Deliverable` block carrying the Symptom · Reproduction · Root cause · Affected
  obligations structure, a reproduction-attempts history, and a hypothesis tracker. Copy it
  into your project's task-file location, substitute the `{{...}}` placeholders from the
  consuming repo's `AGENTS.md` command slots, and fill it in as you work; at close, promote
  the `## Deliverable` block to the bug-report's final home.
