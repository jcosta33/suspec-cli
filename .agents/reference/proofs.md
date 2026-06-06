# Proofs, verdicts & adequacy — operative reference (condensed)

The rules `verify` and `review` apply. Rationale and the full per-task-kind matrix live upstream
(`docs/passes/verify.md`, `docs/passes/review.md`); this card ships the operative rules.

## The 9 proof types (a `VERIFY BY` binds exactly one)
`static` (lint/typecheck/dep-boundary) · `test` (executed unit/integration/e2e; scope as `test:unit:`…) ·
`contract` (boundary shape matches — required for every INTERFACE) · `property` (holds over many inputs;
preferred for INVARIANTs) · `model` (formal/model check) · `perf` (benchmark vs a stated target) ·
`security` (scan) · `manual` (recorded human/agent judgment — no command) · `monitor` (production
observation; lagging, weakest rank).

## Proof-strength order (the working-assumption preorder)
`model > property | contract > test > static > manual | monitor`. Stronger ranks the working assumption
in a contradiction; it does **not** close it (see CONTRADICTED).

## Oracle adequacy (the high-risk rule)
A proof must be *adequate* to its obligation, not merely green. For `RISK high|critical`, a single
example `test` is **inadequate**: record an `oracle_adequacy` note — what surfaces it exercised, with
mutation / metamorphic / property / coverage evidence — else it is `SOL-V011`. A green suite proves only
what it covers. `static`/schema-valid output constrains *shape*, never *truth*.

## The 7-value verdict model (4 core + 3 lifecycle)
**Core (exactly one):** `PASS` (bound proof ran, satisfies) · `FAIL` (ran, contradicts) · `BLOCKED`
(could not run — env/tool/fixture missing; truth unknown, not false) · `UNVERIFIED` (no acceptable proof
bound, or none run). `BLOCKED ≠ UNVERIFIED`; when unsure, record the weaker `UNVERIFIED`.
**Lifecycle decorators (zero or more):** `WAIVED` (on `FAIL`/`UNVERIFIED` only — needs authority+reason+**expiry**;
no permanent waivers; auto-expires on the next source-hash change) · `STALE` (on a prior `PASS` only —
needs prior-verdict ref + changed-surface) · `CONTRADICTED` (any core — needs the two conflicting
evidence refs). Line: `VERDICT <id>: <CORE> [(<lifecycle> by <authority>: <reason>)]` + `REASON` + ≥1 `EVIDENCE`.

## The merge gate (the one normative predicate)
A change set MAY be promoted **iff**, for every required `VERIFY BY` binding of every required obligation
(`REQ`/`CONSTRAINT`/`INVARIANT`/`INTERFACE` in scope), the latest verdict is `PASS` or `WAIVED`, and
**none** is `STALE`/`CONTRADICTED`/`FAIL`/`BLOCKED`/`UNVERIFIED`. One verdict per binding; node `status`
is the aggregate.

## CONTRADICTED resolution (never silent)
Two proofs disagree → it **blocks**; record both evidence refs; the stronger oracle is the working
assumption (not a resolution); reconcile by re-running / fixing the weaker oracle / correcting code /
amending the obligation; the decorator drops only when both agree. Equal strength → no winner, route to
an independent reviewer.

## Model-judge discipline (a `manual` verdict from an LLM judge)
Record judge identity; the judge shares **no lineage** with the generator (else void); **implementer ≠
reviewer** (no self-issued verdict — the self-preference hazard); `RISK high|critical` needs **two
independent judges**. A deterministic proof the author runs is *not* a self-issued verdict — the proof,
not the author, is the oracle; independence is owed only where the oracle is the model's own judgment.

## Non-proofs (never a PASS)
A bare "tests passed" with no command/exit/output; schema-valid output; a stale pre-edit run; a `manual`
verdict with no recorded reasoning.

## Per-`task_kind` default suites (recommended, not a gate; override per obligation)
Resolve `cmd*` through `AGENTS.md > Commands`. `gate:<name>` = an equivalence/coverage check.
- `feature`: `cmdValidate, cmdTest, cmdValidateDeps, gate:acceptance-criteria-coverage`
- `fix`: `cmdValidate, cmdTest, gate:regression-test`
- `refactor`: `cmdValidateDeps, cmdTypecheck, cmdTest, gate:behaviour-preservation`
- `rewrite`: delta proofs + `gate:behaviour-preservation` on the non-delta surface
- `migration`/`upgrade`: per-wave `cmdValidate, cmdTest` + a `git grep` of the old API to zero
- `performance`: baseline + target under the same protocol (`cmdBenchmark`)
- `testing`: the new tests + a flip-the-assertion transition
- `documentation`: every example run; claims cited to file:line
- `orchestration`/`integration`: `merged:cmdValidate, merged:cmdTest, gate:scope-disjointness, gate:merge-intent`
- authoring kinds (`spec-/research-/audit-/bug-report-writing`), `review`, `deepen-audit`: `manual @ REVIEW` + the artifact's own checks.
The five gate tokens: `acceptance-criteria-coverage`, `regression-test`, `behaviour-preservation`,
`scope-disjointness`, `merge-intent`.
