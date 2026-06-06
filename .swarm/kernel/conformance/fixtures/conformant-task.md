<!--
Fixture — expected verdict: PASS; satisfies every rule in ../conformance.yaml.
POSITIVE task-file-schema oracle. A checker run against this MUST return conformant:
all 8 required_sections (per ../conformance.yaml) present in order; non-empty-paste satisfied in
## Verification matrix; no-open-critical satisfied (status: done AND no unresolved
blocking QUESTION). Inert oracle data — Swarm runs nothing.
-->

---
type: task
id: export-json-flag
status: done # active | blocked | done | abandoned (done is terminal)
task_kind: feature
source: .swarm/sources/specs/export-json-flag.swarm.md
assigned_obligations: [AC-001, AC-002]
constraints: [C-001]
invariants: [I-001]
interfaces: [IF-001]
write_surfaces: [src/cli/export.ts, src/format/json.ts]
verification_bindings:
  - AC-001: test:cmdTest:tests/export-json.spec.ts#emits-valid-json
  - AC-002: test:cmdTest:tests/export-json.spec.ts#exit-zero-on-success
  - C-001:  static:cmdValidate:project-aggregate-validation
  - I-001:  property:cmdTest:tests/export.properties.ts#default-output-unchanged
parallel_group: cli-edits
blocked_by: []
produces: [.swarm/generated/traces/export-json-flag.trace.md]
created: 2026-05-30
---

# Task: Add a `--json` flag to the `export` command

## Parent contract

| Field           | Value |
| --------------- | ----- |
| Objective       | Let `export` emit machine-readable JSON so output can be piped to other tools. |
| Deliverable     | `export --json` flag wired through the arg parser to a JSON formatter; default (human) output unchanged. |
| Acceptance bar  | AC-001 and AC-002 each map to a passing proof; C-001 and I-001 preserved; no behavior outside the owned paths. |
| Owned paths     | `src/cli/export.ts`, `src/format/json.ts` |
| Forbidden paths | everything else (notably `src/format/human.ts`, the default formatter) |

## Scope

### In

- Implement AC-001 (emit valid JSON under `--json`) and AC-002 (exit code 0 on success), preserving C-001 and I-001, within `src/cli/export.ts` and `src/format/json.ts`.

### Out

- Do not implement unassigned obligations.
- Do not change behavior outside the assigned write surfaces (`src/cli/export.ts`, `src/format/json.ts`).
- Do not weaken constraints, invariants, or non-goals (in particular, do not alter the default human-readable output path).

## Assigned obligations

The exact assigned SOL blocks, pasted verbatim from `source`:

```
REQ AC-001:
WHEN `export` is invoked with the `--json` flag
THE export command MUST write the result set as a single valid JSON document to stdout
VERIFY BY test:cmdTest:tests/export-json.spec.ts#emits-valid-json
DEPENDS ON IF-001
WRITES src/cli/export.ts
WRITES src/format/json.ts
RISK medium

REQ AC-002:
WHEN `export --json` completes without error
THE export command MUST exit with status code 0
VERIFY BY test:cmdTest:tests/export-json.spec.ts#exit-zero-on-success
WRITES src/cli/export.ts
RISK low
```

## Constraints and invariants

All constraints and invariants this task MUST preserve, pasted verbatim from `source`:

```
CONSTRAINT C-001:
THE export command MUST NOT change its default (no-flag) output;
the human-readable formatter path stays byte-for-byte identical.

INVARIANT I-001:
for any input, omitting `--json` yields exactly the output produced before this change.
```

## Implementation or pass trace

| Obligation / target | Files changed | How satisfied |
| ------------------- | ------------- | ------------- |
| AC-001 | `src/cli/export.ts`, `src/format/json.ts` | Added `--json` to the arg parser; on the flag, the result set is routed to `formatJson()` which serializes one valid JSON document to stdout via `IF-001`. |
| AC-002 | `src/cli/export.ts` | Success path returns exit code 0 after the JSON write completes; error paths unchanged. |
| C-001 | (none) | No-flag branch untouched; default output still flows through `src/format/human.ts`, which is a forbidden path and was not edited. |
| I-001 | (none) | Default-output property test confirms omitting `--json` reproduces pre-change bytes. |

## Verification matrix

| Obligation / C / I | Required proof | Actual proof | Status |
| ------------------ | -------------- | ------------ | ------ |
| AC-001 | `VERIFY BY test:cmdTest:tests/export-json.spec.ts#emits-valid-json` | `export-json.spec.ts#emits-valid-json` passed; fails when the JSON branch is removed (assertion-flip verified) | PASS |
| AC-002 | `VERIFY BY test:cmdTest:tests/export-json.spec.ts#exit-zero-on-success` | `export-json.spec.ts#exit-zero-on-success` passed | PASS |
| C-001 | `VERIFY BY static:cmdValidate:project-aggregate-validation` | aggregate validation clean; default formatter diff empty | PASS |
| I-001 | `VERIFY BY property:cmdTest:tests/export.properties.ts#default-output-unchanged` | property `default-output-unchanged` passed across generated inputs | PASS |
| gate:acceptance-criteria-coverage | every acceptance criterion maps to a passing proof | AC-001, AC-002 each map to a passing `cmdTest` proof above | PASS |

Required paste slots (non-empty-paste, per ../conformance.yaml — fenced output or `n/a` + reason; never a bare placeholder):

- `git status` →
  ```
  On branch feature/export-json-flag
  nothing to commit, working tree clean
  ```
- `{{cmdValidate}}` (last 2 lines) →
  ```
  ✓ 312 files passed
  Done in 9.1s
  ```
- `{{cmdTest}}` (last 2 lines) →
  ```
  Tests: 488 passed, 488 total
  Time:  6.0 s
  ```
- `{{cmdValidateDeps}}` (last 2 lines) → `n/a` — no dependency-graph validator is configured in this project; the `feature` suite's `cmdValidateDeps` slot has no adapter row in `AGENTS.md > Commands`.

## Promotion queue

| Item | Target | Status |
| ---- | ------ | ------ |
| none | — | — |

No discoveries required promotion; the assigned obligations covered the implemented behavior.

## Self-review

> **Hard gate.** Every question has a written answer; every required paste slot is filled; no blocking QUESTION remains open.

<self_review>

- Did I perform only the assigned pass? Yes — `implement` over AC-001, AC-002 only.
- Did I preserve all assigned SOL semantics? Yes — AC-001/AC-002 pasted verbatim and discharged; C-001 and I-001 carried forward unweakened.
- Did I map every completion claim to evidence? Yes — every row in the verification matrix cites a named passing proof; paste slots hold real command output.
- Did I avoid changes outside the declared write surfaces? Yes — only `src/cli/export.ts` and `src/format/json.ts` changed; `src/format/human.ts` untouched.
- Did I resolve every promotion item? Yes — the promotion queue is empty (`none`).
- What remains BLOCKED or UNVERIFIED? Nothing — all verification-matrix statuses are `PASS`; no blocking QUESTION is open.

</self_review>
