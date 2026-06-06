---
type: bug-report
id: {{slug}}
status: open
created: {{createdAt}}
updated: {{createdAt}}
---

# Bug: {{title}}

<!--
  Stance: DIAGNOSIS-ONLY. This document reproduces and root-causes a defect; it
  MUST NOT contain the fix. It names the broken obligation, not the remedy.
  It promotes forward into a fix task.md (task_kind: fix) via the author pass —
  never directly into code. No REQ/CONSTRAINT/INVARIANT/INTERFACE blocks live
  here; obligations are authored only when this report promotes.
-->

## Symptom

<The observable failure in one or two sentences: what is wrong, from the
perspective of whoever (human, agent, CI) saw it. State what *is*, not the fix.>

## Reproduction

<The minimal, deterministic sequence that produces the symptom. Once a reliable
reproduction exists, all other attempts are noise.>

**Steps:**

1. {{step}}
2. {{step}}

**Expected:** <what should happen>

**Actual:** <what does happen>

**Conditions:** <environment, version, config that affect reproducibility>

## Root cause

<State the cause precisely — file, line, what state combines with what input to
produce the symptom. Diagnosis only: name the cause, do NOT prescribe the fix.

Bad:  "The function returns null."
Good: "`getPricing()` (`<path>:<line>`) returns null when the cache is cold and
       the upstream call is rate-limited; the caller `<path>:<line>` treats null
       as 'fallback to default' instead of failing.">

## Affected obligations

<Which existing obligation is broken — the spec id and the local obligation id
(`<spec-id>#<REQ|CONSTRAINT|INVARIANT|INTERFACE>-NNN`) that the defect violates.
If no obligation covers the broken behaviour, say so: that gap is itself a
finding the promoted fix task must reconcile. List references only — author no
obligation blocks here.>

- {{spec-id}}#{{obligation-id}} — <how this obligation is violated>
