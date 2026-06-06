# {{title}}

## Metadata

- Slug: {{slug}}
- Agent: {{agent}}
- Branch: {{branch}}
- Base: {{baseBranch}}
- Worktree: {{worktreePath}}
- Created: {{createdAt}}
- Status: active
- Pass: author · Task kind: bug-report-writing · Profile: Bug Hunter
- Deliverable path: `{{bugReportPath}}` (a working artifact — plain `.md`, **no** `.swarm.` infix)

---

> 🔒 **BUG-REPORT SESSION — DIAGNOSIS ONLY.** Produces a bug-report, not a fix. Reproduce,
> isolate, root-cause; do **not** patch code and do **not** author obligation blocks. The
> remedy is a downstream **fix task** (`task_kind: fix`) this report promotes into — never a
> fix this report dictates, never directly into code. Copy the `## Deliverable` block to the
> path above at close.
>
> **Commands:** `{{cmdTest}}` (test-suite reproduction) and the project run/start command
> resolve from `AGENTS.md > Commands`. If `AGENTS.md` is missing or a slot is undefined, ask
> the user which command to run — do not guess.

---

## Objective

What defect is being investigated and what the report must establish. One paragraph maximum.
The deliverable is a bug-report a fixer can act on without re-discovering the cause.

---

## Constraints

- **No source file changes — bug-report document only.** The fix is a downstream task. Work
  only inside this worktree; do not switch branches, merge, rebase, or push unless instructed.
- Reproduce before explaining; if you cannot reproduce, say so and investigate the discrepancy.
- Distinguish observation from inference; carry unconfirmed explanations in the hypothesis
  tracker, not in the root cause.
- Prescribe no fix; author no `REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` block.

---

## Progress checklist

- [ ] Capture the reported behaviour verbatim in the deliverable's `## Symptom`
- [ ] Attempt reproduction; record every attempt in `### Reproduction attempts (history)`
- [ ] Find a reliable, minimal, deterministic reproduction; paste its verbatim output
- [ ] Form hypotheses in the `### Hypothesis tracker`; test each, record the next adjustment
- [ ] Identify the root cause (file:line, state, input, caller)
- [ ] Search for related defects by *pattern*, not just the file
- [ ] Reference the existing obligation the defect violates (or record the coverage gap)
- [ ] Propose the regression test that would catch a recurrence (do not write it)
- [ ] Self-review hard gate: every question answered, reproduction output pasted
- [ ] Copy the `## Deliverable` block to its final home

---

## Deliverable

> Copy everything between this line and `--- END DELIVERABLE ---` into `{{bugReportPath}}` at
> close, adjusting heading levels as needed. ⚠️ **REPRODUCE BEFORE YOU EXPLAIN** — a bug is a
> hypothesis until reproduced; the symptom is a clue, not a description. If you cannot
> reproduce, mark it `[unable to reproduce]` and document what you tried.

```yaml
---
type: bug-report
id: {{slug}}
status: open
created: {{createdAt}}
updated: {{createdAt}}
---
```

### Symptom

The observable failure in one or two sentences, from the perspective of whoever (human, agent,
CI) saw it. State what *is* wrong — never the fix.

### Reproduction

The minimal, deterministic sequence that produces the symptom. Once a reliable reproduction
exists, all other attempts are noise.

**Steps:** 1. <step> · 2. <step> · 3. <step>

**Expected:** <what should happen> · **Actual:** <what does happen>

**Conditions:** environment, version, config that affect reproducibility.

**Command:** `<exact command run>`

**Output (verbatim — paste, do not paraphrase):**

```text
<paste full failing output here, unedited>
```

**Determinism:** fires every run / fires N of M runs / `[unable to reproduce]`

> A `[unable to reproduce]` is only finalisable with an explanation in the attempts history below.

### Reproduction attempts (history)

(Useful when the reproduction was hard to find — the attempts that did not repro are noise in
the body but context here.)

| # | Steps | Result | Status                                      |
| - | ----- | ------ | ------------------------------------------- |
| 1 |       |        | [reproduces / does not reproduce / partial] |

### Hypothesis tracker

Each disproven hypothesis records the next adjustment in writing, so the next attempt builds on
the last one's signal instead of re-exploring. Append a row before testing each hypothesis;
fill `Status` and `Next adjustment` after.

| # | Hypothesis | Evidence | Status                                          | Next adjustment                                            |
| - | ---------- | -------- | ----------------------------------------------- | ---------------------------------------------------------- |
| 1 |            |          | [confirmed / disproven / supports / unverified] | [what to test next given this result, or `n/a` if closed]  |

### Root cause

State the cause precisely: file, line, what state combines with what input to produce the
symptom, and which caller mis-handles the result. Diagnosis only — name the cause, do **NOT**
prescribe the fix.

- Bad:  "The function returns null."
- Good: "`getPricing()` (`src/billing/pricing-adapter.ts:42`) returns null when the cache is
  cold and the upstream call is rate-limited; the caller `quote.ts:88` interprets null as
  'fall back to default tier' instead of failing."

### Related defects

Defects nearby — same module, same call shape, same missing guard — that may share this root
cause or pattern. Note them even if out of scope for the fix.

- `<path>:<line>` — <description>

### Affected obligations

The existing obligation the defect violates — reference only, by spec id plus local obligation
id; **author no obligation block here.**

- `<spec-id>#<REQ|CONSTRAINT|INVARIANT|INTERFACE>-NNN` — <how this obligation is violated>

> If **no** existing obligation covers the broken behaviour, say so: that gap is itself a
> finding the promoted fix task must reconcile. Record it; do not declare the missing
> obligation here.

### Regression test plan

The test that would catch a recurrence: it sets up the conditions in the reproduction, asserts
the expected behaviour, and lives at `<suggested path>`. State the plan only — writing the test
is part of the downstream fix. If the test runner makes this difficult, note the gap.

### Open questions

- [ ] **[MINOR]** <questions that would refine the fix's scope>

### Distillation Loss Statement

(If distilled from a long investigation.) **Dropped:** <what>. **Why the fixer doesn't need
it:** <why>.

--- END DELIVERABLE ---

---

## Decisions

(Session-level choices — distinct from the deliverable.)

- ***

## Findings (session meta)

(Process-level notes — distinct from the bug-report content.)

- ***

## Assumptions

- [pending]

---

## Blockers

- ***

## Next steps

- *** (concrete starting points if this session ends incomplete)

---

## Self-review

> **Hard gate.** The report is not finalisable until every question below has a written answer
> directly beneath it, and the deliverable's `### Reproduction` holds verbatim pasted output (or
> an `[unable to reproduce]` with an explanation). Review as a senior engineer about to assign
> this report to a fixer — look for parts that could mislead them.

### Verification outputs (paste actual output — do not paraphrase)

- Working-tree status → (must show only the report; revert anything else — bug-report sessions
  are read-only on code):
- Reproduction command output (the bug actually fires):

### Reproduction reliability

- Does the reproduction fire deterministically from a fresh checkout? Did you actually run it,
  or describe what you think would happen? Are the conditions documented (env, version, state)?
  Answer:

### Root-cause depth

- Have you stated the cause as a specific file:line interaction with state and input, or only
  as the symptom? Would the bug recur in a different surface area if the cause is what you say?
  Answer:

### Diagnosis-only boundary

- Does any patch, diff, or remedy design appear anywhere? Did you author any obligation block?
  Is the affected obligation referenced by id (or the coverage gap recorded as a finding)?
  Answer:

### Related defects

- Did you search for related defects by pattern — same module, same call site, same guard — and
  note them (even if out of scope for the fix)?
  Answer:

### Fixer readiness

- Could a fixer write the patch from this report alone, with zero re-investigation? Is the
  regression test that would catch a recurrence identified (or noted as missing)?
  Answer:

### Final polish

- Did you ask: "Did I reproduce, or just convince myself I did? Is the cause the cause, or the
  first plausible explanation I stopped at?"
  Answer:
