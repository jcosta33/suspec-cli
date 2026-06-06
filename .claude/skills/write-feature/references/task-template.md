# {{title}}

## Metadata

- Slug: {{slug}}
- task_kind: feature
- pass: implement
- Stance: Builder
- Source `task.md`: {{taskFile}}
- Owned paths (write_surfaces): {{writeSurfaces}}
- Created: {{createdAt}}
- Status: active

---

> **FEATURE IMPLEMENT PASS** — Build exactly the assigned obligations. Survey before you invent.
> Halt on ambiguity. No opportunistic refactoring. Nothing leaves your hand unproven.
>
> **Commands:** `{{cmdValidate}}` / `{{cmdTest}}` resolve from `AGENTS.md > Commands`. For any
> slot you need that is undefined (e.g. `{{cmdFormat}}` when the change touches docs), ask the user
> — do not guess. If `AGENTS.md` is missing, ask before substituting any command.

---

## Parent contract

(The inherited hand-off, pasted from the `task.md`: objective + deliverable + acceptance bar +
boundaries — owned vs forbidden paths.)

---

## Scope

**In:** (the assigned obligations this packet owns — nothing wider)

-

**Out:** Do not implement unassigned obligations. Do not change behaviour outside the assigned
write surfaces. Do not weaken constraints, invariants, or non-goals. Do not refactor unrelated
code. No new dependencies the obligations did not authorize.

---

## Assigned obligations

(The exact SOL blocks, pasted verbatim — the `REQ` / `INTERFACE` ids this packet implements.)

-

## Constraints and invariants

(The `CONSTRAINT` / `INVARIANT` SOL blocks this task MUST preserve, pasted verbatim.)

-

---

## Plan

(Step-by-step, written before implementation begins. Every acceptance criterion mapped to a step.)

1.
2.
3.

---

## Progress checklist

- [ ] Packet read in full (parent contract, scope, assigned obligations, constraints/invariants)
- [ ] Owned paths confirmed ⊆ assigned obligations' `WRITES` surfaces (no `SOL-O005`)
- [ ] Every acceptance criterion mapped to an implementation step
- [ ] Pattern survey done (existing helpers/types consulted before inventing)
- [ ] Implement core logic
- [ ] Add / update tests for every criterion
- [ ] `{{cmdValidate}}` passes after each batch (paste output below)
- [ ] `{{cmdTest}}` passes (paste output below)
- [ ] Each `test`-bound criterion's oracle flipped → fails → restored → passes (paste transition)
- [ ] TRACE claims written (`IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF` per obligation)
- [ ] Promotion queue resolved (no discovery left unpromoted)
- [ ] Self-review hard gate fully answered

---

## Implementation or pass trace

(What changed, per assigned obligation. One short paragraph each.)

-

## Decisions

(Implementation choices the obligations did not constrain — and why a new pattern was introduced
instead of reusing an existing one, if applicable. Silently resolved ambiguities do NOT go here;
they go to Blockers.)

-

## Findings

(Codebase discoveries worth preserving. Promote durable findings upstream before close.)

-

## Promotion queue

(Every out-of-scope discovery — architectural debt, neighbouring gaps — with a target + status.
ALL must be resolved before this task closes.)

| Discovery | Target | Status |
| --------- | ------ | ------ |
|           |        |        |

---

## Blockers

(Ambiguous or contradictory obligations surfaced for upstream clarification. Do not invent the
requirement — wait for the obligation to be clarified.)

-

## Next steps

(Concrete starting points if this session ends incomplete.)

-

---

## Verification matrix

(Per criterion: the check the spec named, the required proof, the actual pasted proof, the status.
`implement` records only the observed `proof_result`; the verdict is decided downstream.)

| Obligation / criterion | Check binding (`test`/`command`/`manual`) | Required proof | proof_result |
| ---------------------- | ----------------------------------------- | -------------- | ------------ |
|                        |                                           |                |              |

---

## Self-review

Stop. A feature that diverges silently from its assigned obligations ships drift. Act as a senior
engineer about to greenlight this work for the merge gate.

> **Hard gate.** The task is not complete until every question below has a written answer directly
> beneath it, and every command result is the actual pasted output — not a paraphrase, not a
> prediction.

### Verification outputs (paste actual command output — do not paraphrase)

- `{{cmdValidate}}` (last 2 lines):
- `{{cmdTest}}` (last 2 lines):
- Assertion-flip transition for each `test`-bound criterion (fails when flipped → passes when
  restored):

### Did I do only this pass?

- Every change traces to an assigned obligation, or it is recorded as an unassigned change with a
  reason + authorizing ID or `none`. Anything outside the obligations?
  Answer:

### Owned paths

- No file outside the union of assigned `WRITES` surfaces was touched (no `SOL-O005`)?
  Answer:

### Obligation coverage

- Does every acceptance criterion map to an implementation I can point at? Is anything in the
  assigned obligations missing?
  Answer:

### Intent preserved

- Are all constraints, invariants, and non-goals held, not weakened?
  Answer:

### Patterns and conventions

- Did I reuse existing helpers/patterns where they fit, and follow the codebase's idioms (layout,
  naming, error handling)? Any new pattern justified in Decisions?
  Answer:

### Tests fire for the right reason

- Are tests added/updated for the new behaviour, and does each `test`-bound oracle fail when
  flipped and pass when restored?
  Answer:

### Promotion

- Are all promotion-queue items resolved? Nothing stubbed, TODO'd, or half-implemented?
  Answer:

### Final adversarial pass

- What did I leave behind? Did I actually run all the gates, or did I trust my memory? Do not leave
  the work without this final pass.
  Answer:

Only when every answer above is written, and every verification output is the real pasted result,
is this task complete.
