---
type: review
id: REVIEW-{{slug}}
task: TASK-{{slug}}
pr: {{pr-url — or "none yet" for a pre-PR or trunk-based review}}
reviewer: {{who reviews — never the implementing session}}
status: {{draft | pass | waived | blocked | needs-human}}
---

# Review: {{title}}

## Summary

{{2–3 sentences: what changed, what is verified, what is not.}}

## Changed files

- `{{path}}`

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | `{{test}}` output pasted/linked | no |
| AC-002 | Unverified | no test output found | yes |

<!-- Results: Pass · Fail · Unverified · Blocked.
     A Pass needs pasted output, a CI link, or, for a manual Verify method, a
     named human's recorded observation (who judged, what they saw). An empty
     Evidence cell means Unverified, never Pass. Suite/typecheck output stays
     under the task's Verify items — the Run summary section digests it; a failed or
     missing suite routes below via the missing-test-output trigger. -->

Spot-checked: {{which green row's evidence you re-ran yourself}}

## Change-plan coverage

<!-- Only when the task executes a change plan: one row per preservation
     guarantee / wave item, same columns as above. Delete otherwise. -->

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| {{SPEC-x#AC-001 (preserved)}} | {{result}} | {{evidence}} | {{yes/no}} |

## Human attention

<!-- Route the exceptions, not the diff: unverified or failed requirements ·
     out-of-scope changes · risky files · missing test output · changed public
     interfaces · DB migrations · security-sensitive changes · new finding
     candidates · blocked questions. A waived row records: who waived · which
     rows · why · expiry — the packet status becomes `waived` at merge
     (expiry semantics: the advanced lifecycle, in the Swarm repo). -->

1. {{exception — why it matters — suggested action}}

## Suggested decision

{{Merge / Merge with waiver (who · why · expiry) / Block until …}}
