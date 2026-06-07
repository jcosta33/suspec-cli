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
- task_kind: migration   (or: upgrade)
- pass: implement
- profile: migrator

---

> 🔀 **MIGRATION / UPGRADE PASS** — Move the implementation from API A to API B
> while the observable surface stays put. Plan in waves; the codebase must be
> green after **every** wave, not only at the end. Each file migrated individually
> and verified — no bulk codemods, no `sed`, no shell loops. Track old-API
> callsites to zero across the *whole* codebase; document every shim with a
> removable-when criterion.
>
> **AGENTS.md command slots:** `{{cmdValidate}}` and `{{cmdTest}}` resolve from the
> consuming repo's `AGENTS.md > Commands`, and run together after every wave. For
> any slot not defined there (an architectural / dependency-validation command, an
> install command) — **ask the user; do not guess.** A guessed validation command
> produces a false signal about whether a wave left the codebase green. If
> `AGENTS.md` is missing, ask before substituting any slot.
>
> **Behaviour changing?** If the new API is *meant* to behave differently, that is
> a `rewrite`, not a migration — relabel the task and load that discipline.

---

## Parent contract

- Objective (one paragraph): what is being migrated, from what API to what API,
  and why now.
- Deliverable: the codebase moved from API A to API B, observable behaviour
  preserved, old API gone (or its removal scheduled and tracked).
- Acceptance bar: `{{cmdTest}}` + `{{cmdValidate}}` green at every wave and at the
  end; old-API callsites zero outside documented shims; per-wave outputs and the
  beyond-grep audit pasted.
- Owned paths (from `write_surfaces`): <list>
- Forbidden paths: anything outside the owned paths — touching one is `SOL-O005`.

---

## Linked docs

- Migration spec (the `*.swarm.md`): `{{specFile}}`
- Triggering audit (if any): `<path>`

---

## Scope

- **In:** the assigned obligation(s) — the surface move from API A to API B only.
- **Out:** unassigned obligations; any behaviour change outside the assigned write
  surfaces; weakening any constraint, invariant, or non-goal; "while I'm migrating"
  semantic tweaks and neighbouring cleanup (these go to the promotion queue).

---

## Assigned obligations

(Paste the assigned SOL blocks verbatim — `REQ` / `CONSTRAINT` / `INVARIANT` /
`INTERFACE`. Use their IDs as scope.)

---

## Constraints and invariants

(The SOL blocks this task MUST preserve, not relax. Surface behaviour is one of
them.)

---

## Migration source and target

- **From:** the API / framework / pattern being replaced (include the version if
  relevant).
- **To:** the API / framework / pattern replacing it (include the version if
  relevant).
- **Reason:** one sentence on why the migration is happening now.

---

## Equivalence oracle (captured before touching code)

(How preservation is proven — the check that would *fail* if behaviour changed:
differential against the old path behind a shim, golden-output, or property-based.
If the existing suite is the only oracle, state *why* it is sufficient for this
specific migration — e.g. exhaustive named-test coverage of the touched surface,
shown.)

- ***

---

## Wave plan

(Each wave is the smallest atomic change that leaves the codebase compiling and
passing tests. Plan up front — do not discover waves mid-migration.)

| Wave | Scope | Callsites | Validation gate         |
| ---- | ----- | --------- | ----------------------- |
| 1    |       |           | `{{cmdTest}}` + `{{cmdValidate}}` |
| 2    |       |           | `{{cmdTest}}` + `{{cmdValidate}}` |
| …    |       |           |                         |

---

## Callsite tracker

Total callsites of the old API (grep the *whole* codebase, not just scoped
modules): _[count once known]_

| Wave | Callsites in scope | Migrated | Remaining |
| ---- | ------------------ | -------- | --------- |
| 1    |                    |          |           |

> Done only when **Remaining (outside documented shims) is zero**.

---

## Compatibility shims

(Every shim added so the old surface keeps working during the migration. Record it
*before* introducing it. A shim with no removable-when criterion is permanent.)

| Shim path | Forwards to | Removable when (verifiable)            |
| --------- | ----------- | -------------------------------------- |
|           |             | e.g. `git grep -c '<old-API>' src/` = 0 |

---

## Beyond-grep audit

(The references a text search cannot reach. Audit each and paste the result.)

- [ ] Dynamic-dispatch sites (interface impls, virtual methods):
- [ ] String-based references (registry lookups, DI-by-name):
- [ ] Generated code (build outputs, codegen templates):
- [ ] Test fixtures and snapshots; reflection:

---

## Progress checklist

- [ ] Migration spec read in full; from/to/why filled in above
- [ ] Equivalence oracle captured; `{{cmdTest}}` green before any change
- [ ] Old-API callsites counted across the whole codebase; tracker filled
- [ ] Wave plan laid out before starting
- [ ] Owned paths confirmed a subset of assigned `WRITES` (no `SOL-O005`)
- [ ] Wave 1 done, one file at a time — `{{cmdTest}}` + `{{cmdValidate}}` pasted
- [ ] Wave 2 begun only after wave 1's validation passed — outputs pasted
- [ ] _… per wave …_
- [ ] Every shim documented with a verifiable removable-when criterion
- [ ] Beyond-grep audit completed and pasted
- [ ] Old API fully removed (or removal scheduled with a clear, tracked timeline)
- [ ] Final `{{cmdTest}}` + `{{cmdValidate}}` clean
- [ ] No scope creep; out-of-scope findings promoted
- [ ] TRACE block written per obligation: `IMPLEMENTS` / `PRESERVES` / `CHANGED` / `PROOF`
- [ ] Self-review answered with pasted evidence

---

## Implementation or step trace

(What changed, per obligation — which callsites moved from A to B, in which wave.)

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

(Discoveries outside scope — behavioural changes the new API tempts, neighbouring
cleanup, missing tests. Each needs a target + status; all MUST be resolved before
close.)

| Discovery | Target (audit / follow-up / spec) | Status |
| --------- | --------------------------------- | ------ |
|           |                                   |        |

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

- *** (concrete starting points — most migrations span multiple sessions, so this
  file must let the next session pick up at the next wave)

---

## Self-review

> **Hard gate.** Every question below has a written answer directly beneath it, and
> the named outputs are pasted verbatim. Migrations fail two ways — a wave that left
> the codebase half-migrated, and a "completion" that left old-API callsites
> lurking. Review as a senior engineer hostile to both; the Migrator stance applies
> throughout.

### Verification outputs (paste actual command output — do not paraphrase)

- `git status` →
- Per-wave `{{cmdTest}}` + `{{cmdValidate}}` outputs:
- Final `{{cmdValidate}}` (last 2 lines):
- Final `{{cmdTest}}` (last 2 lines):
- `git grep -n '<old-api-marker>'` showing remaining callsites (zero, or only inside documented shims):

### Wave integrity

- Did every wave end with the codebase green? Did `{{cmdTest}}` + `{{cmdValidate}}`
  pass at *every* wave checkpoint? Are the per-wave outputs pasted above?
  Answer:

### Callsite coverage

- Did I grep the *entire* codebase for the old API, not just the modules I expected
  it in? Is the tracker count accurate? Are zero old-API callsites remaining outside
  documented shims?
  Answer:

### Beyond grep

- Where might a callsite hide that grep won't find — dynamic dispatch, string-based
  lookup, registry, generated code, reflection, fixtures? Is the explicit audit of
  each pasted above?
  Answer:

### Shim contracts

- Is every shim documented with a verifiable removable-when criterion? Do the
  criteria reference verifiable conditions? Are any shims that should have been
  removed in *this* migration still present?
  Answer:

### Behaviour preservation

- What is the equivalence oracle, and would it fail if behaviour changed? Are the
  test results before and after identical? Did the migration change behaviour
  anywhere — and if so, is it promoted and a spec/audit updated? A migration changes
  surface, not semantics. If the suite was the only oracle, is the sufficient-oracle
  justification recorded?
  Answer:

### Scope and write surfaces

- Is every change traceable to an assigned obligation, or recorded as an
  `## Unassigned changes` row? Did I touch any file outside my owned paths
  (`SOL-O005`)? Are all promotion items resolved? Did "while I'm migrating" creep in?
  Answer:

### Final state

- Is the old API removed, or is its removal scheduled with a clear, tracked
  timeline? Are there any TODOs, half-migrated files, or stub-shimmed modules left
  behind?
  Answer:
