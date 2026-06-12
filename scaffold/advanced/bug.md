---
type: bug
id: BUG-{{slug}}
title: {{title}}
status: open
owner: {{team-or-person}}
sources:
  - {{ticket-or-report-link}}
---

# Bug: {{title}}

<!-- Lives in specs/<feature>/, beside the spec whose behavior broke.

     Stance: diagnosis only. This document reproduces and root-causes a defect;
     it never contains the fix. The fix is a task (templates/task.md) scoped
     against the spec — most bugs need a fix task, not a new spec. -->

## Symptom

{{the observable failure in one or two sentences — what is wrong, from the
perspective of whoever saw it (human, agent, CI)}}

## Reproduction

<!-- The minimal, deterministic sequence that produces the symptom. Once a
     reliable reproduction exists, every other attempt is noise. -->

1. {{step}}
2. {{step}}

**Expected:** {{what should happen}}
**Actual:** {{what does happen}}
**Conditions:** {{environment, version, config that affect reproducibility}}

## Root cause

<!-- Name the cause precisely — file, line, what state combines with what input
     to produce the symptom. Diagnosis only: name the cause, not the remedy.

     Weak:   "The function returns null."
     Strong: "`getPricing()` (`src/pricing.ts:142`) returns null when the cache
             is cold and the upstream call is rate-limited; the caller at
             `src/cart.ts:88` treats null as 'fall back to default' instead of
             failing." -->

{{root cause, with file:line}}

## Affected requirements

<!-- Which requirement the defect violates, as SPEC-id#AC-NNN. If no
     requirement covers the broken behavior, say so — that gap is the first
     thing the fix task must close, usually by amending the spec. -->

- {{SPEC-x}}#{{AC-NNN}} — {{how it is violated}}
