---
type: review
id: {{slug}}-review
source_trace: {{slug}}-trace
source_spec: {{spec-id}}.swarm.md
reviewed_output: <the output / change set under review>
pass: review
profile: skeptic
created: {{createdAt}}
---

# Review: {{title}}

<!--
This artifact IS the verdict record (see the the `review` pass). There is no separate
verdict.md. A VERDICT is a SOL block recorded here, never a standalone file.
Markdown-only, no runtime: the merge gate below is a contract a deterministic
check (CI / hook / merge-blocking status) enforces when one exists; it is
manual today. Do not claim it is auto-enforced.
-->

## Claimed coverage

<!--
Which TRACE claims which obligations, with evidence refs. One row per claim.
This is what the per-obligation verdicts below adjudicate against.
-->

| Obligation | Claimed by (trace step) | Evidence ref claimed |
| ---------- | ----------------------- | -------------------- |
| {{AC-001}} | {{trace step / id}}     | {{evidence ref}}     |

## Per-obligation verdicts

<!--
One VERDICT block per judged obligation (one per required VERIFY BY binding).
Verdict line grammar (see the the `review` pass):
  VERDICT <id>: <CORE> [(<lifecycle> by <authority>: <reason>[; <fields>])]
  core      ∈ PASS | FAIL | BLOCKED | UNVERIFIED
  lifecycle ∈ WAIVED | STALE | CONTRADICTED
Mandatory lifecycle fields (see the the `review` pass):
  WAIVED       → authority + reason + expiry (only on FAIL/UNVERIFIED)
  STALE        → prior-verdict ref + changed-surface (only on a prior PASS)
  CONTRADICTED → two conflicting EVIDENCE refs (one EVIDENCE line each)
Each block: REASON line, then one or more EVIDENCE lines.
-->

VERDICT AC-001: PASS
REASON <why this core verdict>
EVIDENCE <proof artifact / output reference>

VERDICT AC-002: FAIL (WAIVED by {{authority}}: {{reason}}; expires {{date}})
REASON <why this is unmet but accepted for this window>
EVIDENCE <reference>

## Obligation-verdict matrix

<!-- Compact id × core × lifecycle table for every judged obligation. -->

| Obligation | Core verdict | Lifecycle | Evidence checked |
| ---------- | ------------ | --------- | ---------------- |
| AC-001     | PASS         | —         |                  |
| AC-002     | FAIL         | WAIVED    |                  |

## Constraint and invariant verdicts

<!-- Same verdict grammar, for C- / I- (and IF-) surface ids. -->

| ID    | Core verdict | Lifecycle | Evidence checked |
| ----- | ------------ | --------- | ---------------- |
| C-001 | PASS         | —         |                  |
| I-001 | PASS         | —         |                  |

## Unauthorized changes

<!--
Every change not traceable to an authorizing obligation.
"Authorized by" is an AC/C/I/IF id or `none`; judge each allowed/suspect/reject.
-->

| Change | Authorized by          | Verdict                    |
| ------ | ---------------------- | -------------------------- |
|        | AC/C/I/IF ID or `none` | allowed / suspect / reject |

## Final verdict

<!--
The change-set merge-gate result. Merge IFF every required obligation
(every required VERIFY BY binding) is PASS or WAIVED, and none is
STALE / CONTRADICTED / FAIL / BLOCKED / UNVERIFIED (see the the `review` pass).
-->

Merge gate: PASS / BLOCKED
(merge iff every required obligation is PASS or WAIVED; none STALE/CONTRADICTED/FAIL/BLOCKED/UNVERIFIED)

## Promotion queue

<!-- Items to promote, with target + status. -->

| Item | Target | Status |
| ---- | ------ | ------ |
|      |        |        |
