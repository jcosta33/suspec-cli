---
name: write-bug-report
type: agent-guide
description: >-
  Write a diagnosis-only bug report: reproduce the defect, isolate the root cause to file:line +
  state + input + caller, and name the requirement it violates — no fix. ALWAYS apply when asked
  to report, diagnose, or root-cause a bug, regression, or unexpected behavior, even an
  intermittent one. Never write the fix, conflate symptom with cause, write new requirements, or
  finish without the verbatim failing reproduction pasted. Skip when fixing the defect (that is
  its own task), recording the present state of an area (write-audit), or writing a spec.
---

# Writing a bug report

A bug report is a defect record, not a remedy: symptom, reproduction, root cause, and the
requirement the defect violates. The fix is a separate, later task — and the fixer must be able
to patch from the report alone, with zero re-investigation. Use the template at `advanced/bug.md`; do
not reinvent its sections. These rules are conventions backed by review — nothing in this
repository enforces them automatically.

## The stance

Forensic, hypothesis-driven, read-only on code. Mistrust your first plausible explanation — a
wrong cause wastes the fixer's whole session and lets the defect ship. When an explanation fits,
try to disprove it before you write it down. Diagnosis and remedy are different mindsets; a
combined "diagnose-and-fix" instinct short-circuits diagnosis at the first fit.

## Rules

### 1. Reproduce before you explain

A bug is a hypothesis until reproduced. Run the reproduction (the test command from the
workspace `AGENTS.md` Commands table, or the run command for a runtime defect — if the command
is missing, ask, never guess) and confirm the symptom fires before writing a word about cause.
If you cannot reproduce, say so and investigate the discrepancy (versions, seeds, fixtures,
data, clock, OS) — do not speculate about a cause from a symptom you never saw fire.

### 2. Isolate the smallest deterministic reproduction

Once it fires, narrow it: minimal input, minimal environment, fewest steps. The reproduction in
the final report is _the_ reproduction; keep the failed attempts in an attempts history, never
in the lead. The fixer re-runs exactly what you hand them — a bloated reproduction makes them
re-isolate the bug you already isolated.

### 3. State the root cause as a precise interaction, never the symptom

The root cause is _file:line + what state combines with what input + which caller mishandles
the result_.

- Symptom, not cause: "The function returns null."
- Cause: "`getPricing()` (`src/billing/pricing-adapter.ts:42`) returns null when the cache is
  cold and the upstream call is rate-limited; the caller (`quote.ts:88`) reads null as 'fall
  back to default tier' instead of failing."

A cause stated as a symptom recurs through a different path the moment the same state is hit
again; stated as an interaction, it tells the fixer exactly where the defect lives and why.

### 4. Keep observation and inference apart

An **observation** is what the reproduction shows ("fires deterministically with
`NODE_ENV=production` and a 12 MB input"). An **inference** is your explanation ("the proxy is
dropping bytes"). Track each candidate explanation with a status — supports / disproven /
confirmed — and what you tried next. A confirmed cause backed by refuted alternatives is far
stronger than one plausible guess, and the recorded dead ends save the fixer from re-exploring
them.

### 5. Search for the pattern, not just the file

For the root cause you found, grep the codebase for the same shape — same call pattern, same
null handling, same missing guard. Note every related instance, even out of scope. A cause in
one place usually exists in several; surfacing the family lets the fix widen scope or spawn a
sibling report instead of fixing one instance and shipping the rest.

### 6. Name the regression test; do not write the fix

Identify the test that would catch a recurrence: its location and the assertion it must make
against the reproduction's conditions. State the plan only — writing the test belongs to the fix
task. No patch, no diff, no "the function should return X instead" anywhere in the report.

### 7. Name the violated requirement — or record the coverage gap

Point at the existing requirement the defect violates, by id (`SPEC-x#AC-NNN`), and say how the
observed behavior breaks it. Write no new requirement. If no requirement covers the broken
behavior, say so explicitly and save that as a finding — the fix then starts by adding the
covering requirement to the spec, so the repaired behavior has something to be verified against.

### 8. Paste the failing reproduction verbatim

The report is not finished until the reproduction section holds the **exact command**, the
**verbatim failing output** (fenced, unedited — no paraphrase, no "should reproduce"), and a
determinism note (fires every run / fires N of M runs / `[unable to reproduce]` with what you
tried). A claim without pasted output counts as unverified.

## What does not belong

- The fix: patch, diff, or remedy design — that is the fix task's work.
- Speculation in the root-cause section: only what the reproduction and code verify; unconfirmed
  explanations live in the hypothesis list with a status.
- New requirements, or behavior the system "should" have — reference the violated requirement by
  id, or record the coverage gap as a finding.
- "Should reproduce" or "in theory" — either it reproduces (paste it) or it is marked
  `[unable to reproduce]` with an explanation.
- Source edits. A bug-report session changes no code; the working-tree status proves it.

## Before you finish

Close as the engineer about to hand this to a fixer — look for anything that could mislead them:

- [ ] The exact command and its verbatim failing output are pasted, with conditions (env,
      version, state) and a determinism note.
- [ ] The root cause is a file:line + state + input + caller interaction — not the symptom.
      Would the bug recur via another path if the cause is what you say?
- [ ] Every explanation is confirmed or carried with a status; none asserted as fact unproven.
- [ ] You searched the pattern, not just the file, and noted the related instances.
- [ ] No fix anywhere; the violated requirement is named by id, or the coverage gap is recorded
      as a finding.
- [ ] The regression test that would catch a recurrence is identified (or its absence noted).
- [ ] A fixer could patch from this report alone.
