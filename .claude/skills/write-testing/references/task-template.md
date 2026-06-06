# {{title}}

## Metadata

- Slug: {{slug}}
- task_kind: testing
- pass: implement
- Stance: Test-Author
- Source `task.md`: {{taskFile}}
- Driving doc (spec / audit / bug report, if any): {{specFile}}
- Owned paths (write_surfaces): {{writeSurfaces}}
- Created: {{createdAt}}
- Status: active

---

> **TESTING IMPLEMENT PASS** — Test behaviour, not implementation. Each test fails for one reason.
> Flip the assertion and the test must still mean something. Coverage is a map, not a score.
>
> **Commands:** `{{cmdTest}}` / `{{cmdValidate}}` resolve from `AGENTS.md > Commands`. A coverage
> report and a single-test / flip-and-rerun runner are NOT in the standard contract — for any slot
> you need that is undefined, ask the user; do not guess. If `AGENTS.md` is missing, ask before
> substituting any command.

---

## Parent contract

(The inherited hand-off, pasted from the `task.md`: objective + deliverable + acceptance bar +
boundaries — owned vs forbidden paths. For a testing task the owned paths are the test files and any
test-support surface; production code is forbidden unless an obligation authorises it.)

---

## Scope

**In:** (the assigned obligations whose behaviour this packet tests — nothing wider)

-

**Out:** Do not test behaviour another packet owns. Do not edit production code to ease testing
without an authorising obligation. Do not chase a coverage percentage. Do not stabilise an existing
flaky test here (that is a different task kind). Do not fix a production bug the tests expose inline
— promote it.

---

## Assigned obligations

(The exact SOL blocks, pasted verbatim — the `REQ` / `CONSTRAINT` / `INVARIANT` / `INTERFACE` ids
whose behaviour these tests exercise.)

-

## Constraints and invariants

(The `CONSTRAINT` / `INVARIANT` SOL blocks this task MUST preserve, pasted verbatim. Note: an
`INVARIANT` is a universal predicate — one concrete example is a weak oracle for it; prefer a
property/metamorphic/mutation-backed test and record `oracle_adequacy`, per `verify`.)

-

---

## Coverage gap

(The behaviour currently untested or undertested — stated as behaviour the caller cares about, not
as a line/file percentage. Which module, which behaviour, which conditions.)

-

---

## Test cases

(The cases this task adds. One test per row, one reason to fail per test. "Reason this test exists"
names the behaviour it guards.)

| Behaviour under test | Inputs / setup | Expected outcome | Reason this test exists | Criterion id (if oracle) |
| -------------------- | -------------- | ---------------- | ----------------------- | ------------------------ |
|                      |                |                  |                         |                          |

---

## Test placement

(Where each test goes per the project's testing conventions — file naming, directory, runner. Pick
the convention closest to the code under test; do not guess.)

| Test case | File path | Test runner |
| --------- | --------- | ----------- |
|           |           |             |

---

## Plan

(Written before writing tests. Each coverage-gap behaviour mapped to a case in the table above.)

1.
2.
3.

---

## Progress checklist

- [ ] Packet read in full (parent contract, scope, assigned obligations, constraints/invariants)
- [ ] Owned paths confirmed ⊆ assigned obligations' `WRITES` surfaces (no `SOL-O005`; no production
      code touched without an authorising obligation)
- [ ] Coverage gap named as behaviour (not a percentage)
- [ ] Test cases enumerated (the table above)
- [ ] Test placement decided per project convention (the table above)
- [ ] Each test written against the public surface, one reason to fail
- [ ] Each test FLIPPED → fails → restored → passes (paste the transition below)
- [ ] Each `test`-bound criterion confirmed to fail when *its criterion* is violated (not an
      adjacent condition)
- [ ] High-risk / `INVARIANT` obligations carry an adequate oracle; `oracle_adequacy` recorded
- [ ] `{{cmdTest}}` passes overall (paste output below)
- [ ] `{{cmdValidate}}` passes (paste output below)
- [ ] TRACE claims written (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF` per obligation)
- [ ] Promotion queue resolved (bugs exposed, hard-to-test findings) — none left unpromoted
- [ ] Self-review hard gate fully answered

---

## Implementation or pass trace

(What was added/changed, per assigned obligation. One short paragraph each.)

-

## Decisions

(Test-design choices the obligations did not constrain — placement convention chosen, oracle type
chosen for a high-risk obligation, etc. A criterion you could NOT build a fail-when-violated test
for does NOT go here; it goes to Blockers as a rebind request.)

-

## Findings

(Behaviour the tests surfaced — a real bug, a hidden coupling, a hard-to-test design. Promote
durable findings before close.)

-

## Promotion queue

(Every discovery: a bug a test exposed, production code too coupled to test cleanly, a missing
acceptance criterion — with a target + status. ALL must be resolved before this task closes.)

| Discovery | Target | Status |
| --------- | ------ | ------ |
|           |        |        |

---

## Blockers

(A criterion for which no fail-when-violated test can be built — surfaced upstream as a rebind
request (`test` → `command` / `manual`); a missing command/runner; production code that must change
to be testable. Do not weaken a test or the production code to route around a blocker.)

-

## Next steps

(Concrete starting points if this session ends incomplete.)

-

---

## Verification matrix

(Per obligation/criterion: the check the spec named, the required proof, the actual pasted proof,
the observed status. `implement` records only the observed `proof_result`; the verdict is decided
downstream at `verify`/`review`.)

| Obligation / criterion | Check binding (`test`/`command`/`manual`) | Required proof | proof_result |
| ---------------------- | ----------------------------------------- | -------------- | ------------ |
|                        |                                           |                |              |

---

## Self-review

Stop. Tests that pass when the code is commented out, tests that assert on internals, and tests that
bundle unrelated behaviours are net-negative — they cost maintenance and catch nothing. Act as a
senior engineer hostile to all three, about to greenlight this work for the merge gate.

> **Hard gate.** The task is not complete until every question below has a written answer directly
> beneath it, and every command result is the actual pasted output — not a paraphrase, not a
> prediction.

### Verification outputs (paste actual command output — do not paraphrase)

- `{{cmdTest}}` (last 2 lines):
- `{{cmdValidate}}` (last 2 lines):
- For each new test: the flip transition — output proving it FAILS when the assertion is flipped (or
  the production path is commented out), then PASSES when restored. Paste a representative sample:

### Did I do only this pass?

- Every change traces to an assigned obligation, or it is recorded as an unassigned change with a
  reason + authorizing ID or `none`. No production code touched without an authorising obligation?
  Answer:

### Owned paths

- No file outside the union of assigned `WRITES` surfaces was touched (no `SOL-O005`)?
  Answer:

### Behaviour over implementation

- Do the tests exercise the public surface, or did they reach into internals (private methods,
  module-private state)? Will each survive a reasonable refactor that preserves behaviour?
  Answer:

### Failure-mode clarity

- Does each test fail for one specific reason? When it fails, will the message tell the developer
  what behaviour broke? Confirmed by flipping each assertion?
  Answer:

### Right reason for criterion-bound tests

- For every test that is a criterion's oracle: does it assert the behaviour the criterion describes
  and fail when *that criterion* is violated, not when an adjacent condition changes? For any
  `RISK high|critical` or `INVARIANT` obligation, is the oracle adequate (property / metamorphic /
  mutation) with `oracle_adequacy` recorded (no `SOL-V011`)? Any criterion you could not test was
  surfaced upstream as a rebind request, not silently dropped?
  Answer:

### Placement and determinism

- Is each test placed per the project's conventions? Are the tests deterministic — no ordering,
  timing, shared-state, network, or randomness dependency that could flake under CI?
  Answer:

### Promotion

- Are all promotion-queue items resolved — every bug a test exposed and every hard-to-test finding
  given a target and status? Nothing left unpromoted?
  Answer:

### Final adversarial pass

- What behaviour is still untested that I should have covered? What break in the code would still
  pass my suite? Did I actually run all the gates, or did I trust my memory? Do not leave the work
  without this final pass.
  Answer:

Only when every answer above is written, and every verification output is the real pasted result, is
this task complete.
