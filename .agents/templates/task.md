---
type: task
id: {{slug}}
status: active # active | blocked | done | abandoned (done is terminal)
task_kind: feature # feature | fix | refactor | rewrite | migration | upgrade | performance | testing | documentation | spec-writing | research-writing | audit-writing | bug-report-writing | review | orchestration | integration | deepen-audit
source: # <path to the source doc / spec.swarm.md this pass lowers from>
assigned_obligations: # <list of obligation IDs assigned to this pass: AC-001, REQ-002, ...>
constraints: # <list of C- IDs this pass must preserve>
invariants: # <list of I- IDs this pass must preserve>
interfaces: # <list of IF- IDs in this pass's contract>
write_surfaces: # <paths this pass may write; MUST be a subset of the assigned obligations' WRITES surfaces (SOL-O005 if an owned path falls outside)>
verification_bindings: # <obligation ID -> proof binding (adapter / command reference) per assigned obligation>
parallel_group: # <coordination group this pass runs in, for disjointness proof; or none>
isolation: # worktree+branch | in-place — where this task's work happens (orthogonal to parallel_group; see the implement pass "Isolation"). Omit to let the rule decide: a code task with a source spec/audit -> worktree+branch off the base; ad-hoc/doc/review work -> in-place.
base: # branch this task forks from and merges back to (default main; the dev's current HEAD when handed off mid-branch)
blocked_by: # <task / obligation IDs this pass waits on; [] if unblocked>
produces: # <artifact paths this pass emits under generated/ (e.g. the trace.md / review.md it writes); [] when no durable artifact>
pass: # optional: <the named pass this task activates>
pass_guides: # optional: <the pass-guide refs this task activates>
profile: # optional: <the profile this task activates (e.g. skeptic)>
created: {{createdAt}}
---

# Task: {{title}}

## Parent contract

<The inherited hand-off contract: objective + deliverable + acceptance bar + boundaries (owned vs forbidden paths).>

| Field           | Value |
| --------------- | ----- |
| Objective       |       |
| Deliverable     |       |
| Acceptance bar  |       |
| Owned paths     |       |
| Forbidden paths |       |

## Scope

<An explicit In / Out list bounding the step.>

### In

-

### Out

- Do not implement unassigned obligations.
- Do not change behavior outside the assigned write surfaces.
- Do not weaken constraints, invariants, or non-goals.

## Assigned obligations

Paste the exact assigned SOL blocks here, verbatim.

## Constraints and invariants

Paste all constraints and invariants this task must preserve.

## Implementation or step trace

<What changed, per obligation.>

| Obligation / target | Files changed | How satisfied |
| ------------------- | ------------- | ------------- |
|                     |               |               |

## Verification matrix

<Required proof -> actual proof -> 7-value status, per obligation.>

| Obligation / C / I | Required proof | Actual proof | Status |
| ------------------ | -------------- | ------------ | ------ |
|                    |                |              | PASS / FAIL / BLOCKED / UNVERIFIED |

## Promotion queue

<Discoveries with target + promotion status (see the `promote` step); all MUST be resolved before task close.>

| Item | Target | Status |
| ---- | ------ | ------ |
|      |        | pending / promoted / deferred / rejected / blocked / validated / rolled-back |

## Self-review

<The structured self-review block: did I do only this step; preserve semantics; map every claim to evidence.>

<self_review>

- Did I perform only the assigned step?
- Did I preserve all assigned SOL semantics?
- Did I map every completion claim to evidence?
- Did I avoid changes outside the declared write surfaces?
- Did I resolve every promotion item?
- What remains BLOCKED or UNVERIFIED?

</self_review>
