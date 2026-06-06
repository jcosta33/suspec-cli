# {{title}}

## Metadata

- Slug: {{slug}}
- Agent: {{agent}}
- Branch: {{branch}}
- Base: {{baseBranch}}
- Worktree: {{worktreePath}}
- Created: {{createdAt}}
- Status: active
- Type: task
- task_kind: fix
- pass: implement
- profile: skeptic

---

> 🔧 **FIX PASS** — Reproduce the defect deterministically, patch the root cause
> (not the symptom), add a regression test that fails before the patch and passes
> after, run the full suite, and record TRACE claims with pasted proof.
>
> **AGENTS.md command slots:** `{{cmdValidate}}` / `{{cmdTest}}` resolve from the
> consuming repo's `AGENTS.md > Commands`. For any slot not defined there
> (`{{cmdLint}}`, `{{cmdTypecheck}}`, an install command) — **ask the user; do not
> guess.** A guessed test command produces a false signal about whether the bug is
> gone. If `AGENTS.md` is missing, ask before substituting any slot.
>
> **Flaky?** If the failing test is non-deterministic, this is the wrong template —
> a flake's oracle is a loop-run, not a deterministic reproduction. Use the
> `fix-flaky-test` guide instead.

---

## Parent contract

- Objective (one paragraph): fix the defect described in the linked bug report.
- Deliverable: the minimal patch + a regression test, red before and green after.
- Acceptance bar: the pre-patch reproduction and the failing → passing regression
  transition are pasted; `{{cmdValidate}}` and `{{cmdTest}}` are clean.
- Owned paths (from `write_surfaces`): <list>
- Forbidden paths: anything outside the owned paths — touching one is `SOL-O005`.

---

## Linked docs

- Bug report / defect description: `{{bugReportFile}}`
- Spec defining the broken behaviour (if any): `<path>`
- Related audit (if the bug intersects an audited area): `<path>`

---

## Scope

- **In:** the assigned obligation(s) and the named defect only.
- **Out:** unassigned obligations; behaviour outside the assigned write surfaces;
  weakening any constraint, invariant, or non-goal; neighbouring bugs and "while
  I'm here" cleanup (these go to the promotion queue).

---

## Assigned obligations

(Paste the assigned SOL blocks verbatim — `REQ` / `CONSTRAINT` / `INVARIANT` /
`INTERFACE`. Use their IDs as scope.)

---

## Constraints and invariants

(The SOL blocks this task MUST preserve, not relax.)

---

## Reproduction (paste actual output — the bug MUST fire here)

Re-run the bug report's reproduction in *this* worktree. If it does not fire, do
not patch — record a blocker and investigate the environment discrepancy (it is
itself a finding, not a dismissal).

```
[paste reproduction command output — the bug should fire]
```

---

## Plan

1.
2.
3.

---

## Iteration trail

(Each fix attempt is a row. When an attempt fails, write the reflection that drives
the next one — not just *what* failed but *what that teaches*. The trail is the
verbal-feedback loop the next iteration reads to avoid repeating a dead end.)

| Trial # | Hypothesis | Attempt | Outcome | Next adjustment (verbal reflection) |
| ------- | ---------- | ------- | ------- | ----------------------------------- |
| 1       | …          | …       | …       | —                                   |

---

## Progress checklist

- [ ] Bug report read in full; reproduction understood
- [ ] Reproduction re-run; bug fires (output pasted)
- [ ] Root cause located at the `file:line` cited in the bug report
- [ ] Patch implemented at the root cause (minimal change)
- [ ] Regression test added; fails before patch (verified by patching out the fix and re-running)
- [ ] Regression test passes after patch
- [ ] `{{cmdValidate}}` clean (output pasted)
- [ ] `{{cmdTest}}` clean — full suite, not just the regression test (output pasted)
- [ ] No scope creep; related findings promoted
- [ ] No file touched outside owned paths (no `SOL-O005`)
- [ ] TRACE block written: `IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`
- [ ] Self-review answered with pasted evidence

---

## Implementation or pass trace

(What changed, per obligation, and *why this patch addresses the cause* — not the
symptom. The reviewer checks this.)

- ***

---

## Verification matrix

| Obligation ID | Required proof | Actual proof (pasted) | proof_result (`passed`/`failed`/`blocked`/`unverified`) |
| ------------- | -------------- | --------------------- | ------------------------------------------------------- |
|               |                |                       |                                                         |

> `proof_result` is the *observed* run outcome. The uppercase verdict (one of the 7
> values — 4 core `PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED` + 3 lifecycle
> `WAIVED`/`STALE`/`CONTRADICTED`) is decided downstream at `verify`/`review`, not
> here. Do not self-certify a PASS.

---

## Promotion queue

(Discoveries outside scope — neighbouring bugs, refactor opportunities, missing
tests elsewhere. Each needs a target + status; all MUST be resolved before close.)

| Discovery | Target (bug-report / audit / follow-up) | Status |
| --------- | --------------------------------------- | ------ |
|           |                                         |        |

---

## Unassigned changes

(Any change not traceable to an assigned obligation — with reason + authorizing ID,
or `none`. Judged at `review`. Default: there should be none.)

- none

---

## Decisions

- ***

## Findings

- ***

## Assumptions

- [pending]

---

## Blockers

- ***

## Next steps

- ***

---

## Self-review

> **Hard gate.** Every question below has a written answer directly beneath it, and
> the two required proofs are pasted verbatim. A fix that addresses the symptom
> rather than the cause leaves the bug latent — close as a senior engineer hostile
> to "looks fine". The Skeptic stance applies: refute your own patch by default.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` →
- Pre-patch reproduction (the bug actually fires in this worktree):
- Failing regression test (the fix patched out — test goes red):
- Passing regression test (the fix restored — test goes green):
- `{{cmdValidate}}` (last 2 lines):
- `{{cmdTest}}` (last 2 lines, full suite):
- `git diff --stat`:

### Root-cause coverage

- Did I patch the root cause cited in the bug report (`file:line`), or did I
  suppress a symptom elsewhere? Could the bug recur via a different path under the
  same cause?
  Answer:

### Regression-test integrity

- Does the regression test fail when I patch out my fix? Did I verify it (the
  failing-test output is pasted above)? Does it assert on behaviour, not internal
  state?
  Answer:

### Side effects

- Did the patch change behaviour anywhere else? Did `{{cmdTest}}` pass for the rest
  of the suite, not just the regression test?
  Answer:

### Scope and write surfaces

- Is every change traceable to the assigned obligation, or recorded as an
  `## Unassigned changes` row? Did I touch any file outside my owned paths
  (`SOL-O005`)? Are related defects promoted rather than bundled?
  Answer:

### Related defects

- The bug report listed defects nearby. Did I check whether any are now triggered
  or fixed by my patch, and leave them as promoted follow-up work?
  Answer:

### Minimality

- Is this the *minimum* fix? Did I sneak in a "small improvement" that changes
  behaviour beyond the bug?
  Answer:
