# {{title}}

## Metadata

- Id: {{id}}
- Source spec: {{source}}
- Status: active
- Type: task
- task_kind: rewrite
- Pass: implement
- Profile/stance: Builder

---

> ⚠️ **REWRITE PASS** — distinct from refactor. A refactor preserves behaviour
> end to end; a rewrite changes some of it deliberately. Make the behaviour delta
> explicit before changing code; prove two surfaces (the delta and the preserved
> non-delta); halt and amend the spec on any emergent change.
>
> **`cmd*` slots:** `cmdValidate` / `cmdTest` / `cmdFormat` resolve from
> `AGENTS.md > Commands`. If `AGENTS.md` is missing or a needed slot is
> undefined, ask the user before substituting — never guess a command.

---

## Parent contract

The inherited hand-off: objective + deliverable + acceptance bar + boundaries
(owned vs forbidden paths). One paragraph.

---

## Scope

**In:** what this pass rewrites.
**Out:** do not implement unassigned obligations; do not change behaviour outside
the assigned write surfaces or outside the behaviour-delta table below; do not
weaken constraints, invariants, or non-goals.

---

## Assigned obligations

The exact assigned SOL blocks (`REQ` / `CONSTRAINT` / `INVARIANT` / `INTERFACE`),
pasted verbatim.

---

## Behaviour delta

The explicit before/after list. **Anything not listed here MUST be preserved.**
Leave no `Behaviour change?` blank — every aspect is either in the delta or
preserved.

| Aspect | Before | After |
| ------ | ------ | ----- |
|        |        |       |

---

## Acceptance criteria

Each a checkbox; all checked before this task is done. Include explicit
**preservation criteria** ("preserves prior behaviour X") for the non-delta — a
rewrite that tests only its delta proves nothing about the regression risk.

- [ ] (delta)
- [ ] (preservation)

---

## Module plan

Which modules are touched and what changes in each.

| Module | Change | Behaviour change? |
| ------ | ------ | ----------------- |
|        |        |                   |

---

## Constraints and invariants

The SOL blocks this task MUST preserve, pasted verbatim.

---

## Progress checklist

- [ ] Read the packet and the driving spec/audit in full
- [ ] Confirm owned paths ⊆ assigned `WRITES` surfaces (no `SOL-O005`)
- [ ] Fill the behaviour-delta table
- [ ] Derive acceptance criteria (delta + preservation)
- [ ] Capture the non-delta equivalence oracle before touching code; `cmdTest` green
- [ ] Inventory all callers (`git grep` across the whole codebase + string forms)
- [ ] Rewrite in batches; `cmdValidate` + `cmdTest` after each, pasted as you go
- [ ] Prove the delta (assertion-flip for `test`-bound criteria, both transitions pasted)
- [ ] Prove the non-delta against the equivalence oracle
- [ ] Write TRACE claims (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`) + provenance
- [ ] Resolve every promotion item
- [ ] Self-review answered with evidence pasted

---

## Implementation or pass trace

What changed, per obligation.

- ***

## Verification matrix

ID → required proof → actual proof → 7-value status, per obligation.

| ID | Required proof | Actual proof (pasted) | Status |
| -- | -------------- | --------------------- | ------ |
|    |                |                       |        |

---

## Decisions

- ***

## Findings

- ***

## Assumptions

- [pending]

---

## Unassigned changes

Any change outside the assigned obligations, with reason + authorizing ID or
`none`.

- none

## Promotion queue

Discoveries to promote, with target + status. All MUST be resolved before close.

- ***

---

## Blockers

- ***

## Next steps

Concrete starting points if this session ends incomplete.

- ***

---

## Self-review

> **Hard gate.** The task is not complete until every question below has a written
> answer directly beneath it, with the named output pasted verbatim. Rewrites are
> riskier than refactors precisely because behaviour is permitted to change — act
> as a senior engineer doing an adversarial review of your own diff.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` →
- `cmdValidate` (last 2 lines):
- `cmdTest` (last 2 lines):

### Behaviour-delta integrity

Does every behaviour change you made appear in the delta table? Did any change
sneak in that was not planned? For the preserved non-delta, what is the
equivalence oracle, would it fail if behaviour changed, and is its output pasted?

Answer:

### Two-surface proof

Is every delta criterion proven against its check binding (assertion-flip
transition pasted for `test`-bound ones)? Is every preservation criterion proven
by the equivalence oracle (or the sufficient-oracle justification recorded if the
suite was the only oracle)?

Answer:

### Caller migration

Did you `git grep` every caller of the rewritten symbols across the *whole*
codebase, including string forms (dynamic dispatch, registries, reflection,
generated code, config)? Did you update each for the new behaviour or verify each
still works under the preserved behaviour? Is the search output pasted?

Answer:

### Scope

Did I touch only the assigned obligations and only the declared write surfaces
(no `SOL-O005`)? Did "redesign while we're here" creep in? Are all promotion
items resolved? Correct in-scope work that grew beyond the estimate is noted in
Decisions, not reverted.

Answer:

### Completeness

Is anything left stubbed, TODO'd, or half-rewritten? Could the next developer
continue from this task file alone?

Answer:

### Final adversarial pass

What is now subtly different that the oracle does not cover? What else could make
this more stable or correct? Do not close without this.

Answer:

Only when every answer above is written is this task complete.
