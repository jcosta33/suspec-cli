# payment-5xx — expected outcome (golden-corpus POSITIVE fixture)

This manifest pins the expected outcome of the `payment-5xx` positive (must-compile)
fixture, the inert oracle a conformant tool is checked against (see [`../../conformance.yaml`](../../conformance.yaml)). It is the authority
for this directory: the per-stage files reproduce the `intent → promotion` pipeline, and
this manifest records the verdict a correct run must produce at each gate.

**Expected verdict: PASS after reconcile.**

## What this fixture is

- **Domain:** payment-5xx (payment-processor 5xx handling — incident-driven, proof-heavy).
- **Polarity:** positive — the obligation set must compile and reach a mergeable PASS.
- **Canonical defect cluster exercised (on the *authored* source, stage 1):**
  a `MUST` / `MUST NOT` contradiction on one trigger (`SOL-M002`), a vague-quality predicate
  ("handle failures gracefully", `SOL-P005`), and a blocking `QUESTION` (`Q-001`) that would
  be `SOL-O003` if it reached lowering. The deconflict introduces a no-double-charge `INVARIANT`
  (`I-001`) whose only honest oracle is a production observation — the **`monitor`** proof type.
- **Arc showcased:** a `CONTRADICTED` → `BLOCKED` → (reconcile) → `PASS` merge-gate arc, driven
  by a harness `test` PASS disagreeing with a production `monitor` FAIL about the same property.

## Stage files

| Stage | Pass | File | Asserts |
| ----- | ---- | ---- | ------- |
| 1 | author | `spec.swarm.md` | authored source; parses; carries the seeded defects |
| 2 | lint | (this manifest) | the two BLOCKING diagnostics + the blocking-QUESTION note |
| 3 | improve | `spec.improved.swarm.md` | the diagnostics clear; `Q-001` resolved and removed |
| 4 | lower | `payment-5xx.swarm.ir.json` | typed IR; `edges[]` the sole relationship source; `monitor` binding on `I-001` |
| 5 | decompose, implement | `task.md` | work packet frame; write surfaces ⊆ assigned `WRITES`; `monitor` row `pending` |
| 6 | verify | `trace.md` | `TRACE T-001` + the 7-field provenance table; `monitor` FAIL recorded |
| 7 | review | `review.md` | per-obligation `VERDICT`s; the `CONTRADICTED` → `BLOCKED` → `PASS` gate arc |
| 8 | promote | `finding.md` | the durable finding promoted with full provenance |

> The `task.md` here shows the **pipeline-relevant work-packet frame**, not a full task-file. The task-file-schema `required_sections` rule (see [`../../../templates/task.md`](../../../templates/task.md)) is exercised by [`../conformant-task.md`](../conformant-task.md) (positive) and [`../violations.md`](../violations.md) (negatives).

## Expected lint diagnostics (stage 2, on the authored `spec.swarm.md`)

Two BLOCKING diagnostics fire, each in the unified `SOL-<LAYER><NNN>` namespace (see [`../../../language/errors.md`](../../../language/errors.md)). Each is
BLOCKING because it changes *what* gets built. Each names the closed `improve` op (see [`../../../passes/improve.md`](../../../passes/improve.md)) or
direct edit that repairs it.

| Code | Layer | Severity | Span | Defect | Repair |
| ---- | ----- | -------- | ---- | ------ | ------ |
| `SOL-M002` | M | BLOCKING | `AC-020` | `MUST retry` and `MUST NOT retry` share one actor + trigger (opposed modalities on the same contradiction key) | improve op `DECONFLICT` |
| `SOL-P005` | P | BLOCKING | `AC-021` | "handle failures gracefully" — high-risk word in a binding clause with no same-line observable criterion | improve op `CONCRETIZE`/`QUANTIFY` |

Plus a blocking-QUESTION risk recorded as a note: `Q-001` is `[blocking]` and `AFFECTS AC-020`.
`AC-020` MUST NOT reach the `lower` pass while `Q-001` is open; a blocking `QUESTION` that does
reach `lower` is **`SOL-O003`** (blocking-question-reaches-lowering, see [`../../../language/errors.md`](../../../language/errors.md)). In this fixture
`Q-001` is resolved at the `improve` stage, so `SOL-O003` does **not** fire downstream — it is
the risk the open question would have raised had it survived to lowering.

> Note on the authored `I-001` and `AC-020` bindings: the authored `AC-021` already carries a
> `VERIFY BY`, and `I-001`/`AC-020` gain theirs at `improve` via `BIND` (alongside the
> `DECONFLICT`/`CONCRETIZE` repairs). The seeded blocking set is the two codes above plus the
> blocking-QUESTION note; the missing bindings are repaired in the same `improve` pass that
> deconflicts and concretizes, so no separate `SOL-V001` is pinned as the headline defect here.

## Expected after `improve` (stage 3)

Both BLOCKING diagnostics clear and no blocking `QUESTION` remains:

- `DECONFLICT` resolved `AC-020`'s `MUST retry` / `MUST NOT retry` contradiction. The owner's
  intent was a *bounded* retry, never an unconditional one: `AC-020` becomes "retry at most 3
  times under the same idempotency key", and the no-double-charge concern moves onto its own
  `INVARIANT` (`I-001`) — clears `SOL-M002`.
- `CONCRETIZE` replaced `AC-021`'s "handle failures gracefully" with an observable criterion
  (return HTTP 502 with a structured `processor-unavailable` body inside the 30s budget) —
  clears `SOL-P005`.
- `BIND` attached the missing bindings on only `AC-020` (a `test` proof) and `I-001` (a
  `monitor` proof — no harness can witness a real duplicate capture, so the honest oracle is the
  production duplicate-captures dashboard, see [`../../../passes/verify.md`](../../../passes/verify.md)). `IF-001` (its `contract` proof) and `AC-021`
  (its `test` proof) already carried their bindings in the authored stage-1 source; `CONCRETIZE`
  only reworded `AC-021`'s selector (`surfaces-error` → `surfaces-502`).
- `Q-001` resolved out-of-band (decision: retry automatically up to the bound, then surface a
  502) and removed — clears the `SOL-O003` risk before lowering.

## Expected merge-gate outcome (stage 7) → final

`AC-021` is a clean `PASS`. `AC-020` (`test` PASS) and `I-001` (`monitor` FAIL) disagree about
the same no-double-charge property, so both carry the `CONTRADICTED` decorator with the two
conflicting evidence refs (see [`../../../passes/review.md`](../../../passes/review.md)). Per the proof-strength preorder
`model > property | contract > test > static > manual | monitor`, the `test` PASS is the
*working assumption* over the `monitor` FAIL — but a working assumption does not close the
contradiction.

```text
Gate (first evaluation): BLOCKED — AC-020 and I-001 are CONTRADICTED (I-001 core FAIL).
Reconcile (passes/review.md): re-examine the disagreeing proofs (never pick the convenient one);
                          the production duplicates came from concurrent requests racing before
                          the idempotency key persisted — fix with a single-flight guard,
                          re-run both proofs.
Gate (re-evaluation):     test (+ concurrent case) PASS and monitor window now zero;
                          both proofs agree → CONTRADICTED drops; I-001 → PASS.
Final outcome:            PASS.
```

**Final gate: BLOCKED → (reconcile) → PASS.** A `CONTRADICTED` is never closed by silently
trusting the stronger oracle's working assumption (see [`../../../passes/review.md`](../../../passes/review.md)); the contradiction is closed only
when both proofs agree after a recorded reconciliation.

## Stable identifiers and hashes (consistent across all stages)

- Obligations: `IF-001`, `AC-020`, `AC-021`, `I-001`; question `Q-001`; trace `T-001`.
- Content hashes carried unchanged stage to stage: `IF-001` source `sha256:2c8d…b1`,
  `AC-020` source `sha256:4f6a…e2`, `AC-021` source `sha256:9a01…7c`, `I-001` source
  `sha256:b730…5d`; the implemented write surface `server/src/payments/charge.ts` is
  `sha256:6b22…9f` in the recorded trace.
- Proof types span three of the nine (see [`../../../passes/verify.md`](../../../passes/verify.md)): `contract` (`IF-001`), `test` (`AC-020`/`AC-021`),
  and `monitor` (`I-001`) — the production observation that drives the contradiction.
- Adopted-project paths use `.swarm/` throughout (e.g. `.swarm/sources/specs/payment-5xx.swarm.md`).

## How this is validated (no runtime)

Inert data (NO RUNTIME): the verdicts above are known independent of any tool and validated by hand; this manifest is the expected-outcome contract a future checker would validate against, not a tool Swarm provides.
