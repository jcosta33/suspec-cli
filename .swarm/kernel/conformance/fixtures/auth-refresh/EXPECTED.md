# auth-refresh — expected outcome (golden-corpus POSITIVE fixture)

This manifest pins the expected outcome of the `auth-refresh` positive (must-compile)
fixture, the inert oracle a conformant tool is checked against (see [`../../conformance.yaml`](../../conformance.yaml)). It is the authority
for this directory: the per-stage files reproduce the full `intent → promotion` pipeline,
and this manifest records the verdict a correct run must produce at each gate.

**Expected verdict: PASS after reconcile.**

## What this fixture is

- **Domain:** auth-refresh (silent token refresh on 401).
- **Polarity:** positive — the obligation set must compile and reach a mergeable PASS.
- **Canonical defect cluster exercised (on the *authored* source, stage 1):**
  a vague-quality predicate (`SOL-P005`), a `SHOULD` with no `BECAUSE`/`EXCEPT` (`SOL-S006`),
  a missing-verification binding (`SOL-V001`), the no-unbounded-retry `INVARIANT` (`I-001`),
  and a blocking `QUESTION` (`Q-001`).

## Stage files

| Stage | Pass | File | Asserts |
| ----- | ---- | ---- | ------- |
| 1 | author | `spec.swarm.md` | authored source; parses; carries the seeded defects |
| 2 | lint | (this manifest) | the three BLOCKING diagnostics + the blocking-QUESTION note |
| 3 | improve | `spec.improved.swarm.md` | the three diagnostics clear; `Q-001` resolved and removed |
| 4 | lower | `auth-refresh.swarm.ir.json` | typed IR; the two chained REQs each split per clause — `AC-001` → `AC-001.1`/`AC-001.2`, `AC-002` → `AC-002.1`/`AC-002.2` (six nodes: `IF-001`, `AC-001.1/.2`, `AC-002.1/.2`, `I-001`); `edges[]` the sole relationship source |
| 5 | decompose, implement | `task.md` | work packet frame; write surfaces ⊆ assigned `WRITES` |
| 6 | verify | `trace.md` | `TRACE T-001` + the 7-field provenance table; one binding per surface obligation (`IF-001`, `AC-001`, `AC-002`, `I-001`) |
| 7 | review | `review.md` | one `VERDICT` per required binding **including the `IF-001` interface contract** (an INTERFACE in scope is a judged obligation, merge-gate); merge-gate outcome |
| 8 | promote | `finding.md` | the durable finding promoted with full provenance |

> The `task.md` here shows the **pipeline-relevant work-packet frame** (scope + the verification matrix the trace consumes), not a full task-file. The task-file-schema `required_sections` rule ([`../../conformance.yaml`](../../conformance.yaml)) is exercised by the dedicated schema fixtures [`../conformant-task.md`](../conformant-task.md) (positive) and [`../violations.md`](../violations.md) (negatives).

## Expected lint diagnostics (stage 2, on the authored `spec.swarm.md`)

Three BLOCKING diagnostics fire, each in the unified `SOL-<LAYER><NNN>` namespace ([`../../../language/errors.md`](../../../language/errors.md)). Each
is BLOCKING because it changes *what* gets built. Each names the closed `improve` op ([`../../../passes/improve.md`](../../../passes/improve.md)) or
direct edit that repairs it.

| Code | Layer | Severity | Span | Defect | Repair |
| ---- | ----- | -------- | ---- | ------ | ------ |
| `SOL-V001` | V | BLOCKING | `AC-002` | obligation has no `VERIFY BY` binding (no verification path) | improve op `BIND` |
| `SOL-S006` | S | BLOCKING | `AC-002` | `SHOULD` with no accompanying `BECAUSE`/`EXCEPT` | Edit: add `BECAUSE`, or raise to `MUST` |
| `SOL-P005` | P | BLOCKING | `I-001` | vague-quality predicate with no same-line observable criterion | improve op `CONCRETIZE`/`QUANTIFY` |

Plus a blocking-QUESTION risk recorded as a note: `Q-001` is `[blocking]` and `AFFECTS AC-002`.
`AC-002` MUST NOT reach the `lower` pass while `Q-001` is open; a blocking `QUESTION` that does
reach `lower` is **`SOL-O003`** (blocking-question-reaches-lowering, [`../../../language/errors.md`](../../../language/errors.md)). In this fixture
`Q-001` is resolved at the `improve` stage, so `SOL-O003` does **not** fire downstream — it is
the risk the open question would have raised had it survived to lowering.

## Expected after `improve` (stage 3)

All three BLOCKING diagnostics clear and no blocking `QUESTION` remains:

- `NORMALIZE` resolved `AC-002`'s `SHOULD` to `MUST` (owner judged the session-clear
  mandatory, so no `BECAUSE` is needed) — clears `SOL-S006`.
- `CONCRETIZE` fixed `I-001`'s threshold to the literal `1` and named the measured quantity —
  clears `SOL-P005`.
- `BIND` attached a `test` proof to `AC-002` and a `property` proof to `I-001` (an `INVARIANT`
  prefers `property`/`model`/`static`, [`../../../passes/verify.md`](../../../passes/verify.md)) — clears `SOL-V001`.
- `Q-001` resolved out-of-band (decision: redirect to `/login`) and removed — clears the
  `SOL-O003` risk before lowering.

## Expected merge-gate outcome (stage 7) → final

`IF-001` (the interface contract), `AC-001`, and `I-001` are clean `PASS`. `AC-002` is `PASS (STALE …)`: its bound test PASSed, but
`web/src/http/client.ts` was edited after the recorded PASS, so its source no longer matches
([`../../../passes/review.md`](../../../passes/review.md)). A STALE required obligation is not mergeable.

```text
Gate (first evaluation): BLOCKED — AC-002 is STALE.
Reconcile (option 1):       re-run the bound proof against the current surface.
Gate (re-evaluation):       AC-002 → PASS; every required obligation PASS.
Final outcome:              PASS.
```

**Final gate: BLOCKED → (reconcile) → PASS.** A STALE verdict is never silently re-blessed
([`../../../passes/review.md`](../../../passes/review.md)); the reconcile re-ran the proof and produced a fresh matching PASS.

## Stable identifiers and hashes (consistent across all stages)

- Obligations: `IF-001`, `AC-001` (IR-split `AC-001.1`/`AC-001.2`), `AC-002`, `I-001`; question `Q-001`; trace `T-001`.
- Content hashes carried unchanged stage to stage: `AC-001` source `sha256:9b2e…41`,
  `I-001` source `sha256:7d10…aa`, `IF-001` source `sha256:1f4a…c0`; the promoted finding
  pins `content_hash: sha256:9b2e…41` (the `AC-001` source span).
- Adopted-project paths use `.swarm/` throughout (e.g. `.swarm/sources/specs/auth-refresh.swarm.md`).

## How this is validated (no runtime)

Inert data (NO RUNTIME): the verdicts above are known independent of any tool and validated by hand; this manifest is the expected-outcome contract a future checker would validate against, not a tool Swarm provides.
