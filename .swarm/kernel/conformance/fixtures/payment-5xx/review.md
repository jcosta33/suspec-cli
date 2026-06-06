<!--
payment-5xx golden-corpus POSITIVE fixture — Stage 7 (review + merge gate, pass: review,
run under the `skeptic` profile, see [../../../skills/persona-skeptic/SKILL.md](../../../skills/persona-skeptic/SKILL.md)). The `review` pass consumes the trace and emits
per-obligation VERDICT lines carrying a core value optionally decorated with a lifecycle
value (see [../../../passes/review.md](../../../passes/review.md)). AC-021 is a clean PASS. AC-020 (`test` PASS) and I-001 (`monitor` FAIL) disagree
about the same no-double-charge property, so both carry the CONTRADICTED decorator with the
two conflicting evidence refs (see [../../../passes/review.md](../../../passes/review.md)). Per the proof-strength preorder
(model > property|contract > test > static > manual|monitor) the `test` PASS is the *working
assumption* over the `monitor` FAIL — but a working assumption does NOT close the contradiction:
a CONTRADICTED on any required obligation BLOCKS the merge gate until reconciled (see [../../../passes/review.md](../../../passes/review.md)). The
reconcile note records the resolution — the production double-captures came from concurrent
requests racing before the idempotency key persisted (a real defect the harness test never
exercised), the code is fixed with a single-flight guard, and both proofs are re-run and now
agree — after which the CONTRADICTED decorator drops and the gate opens. Inert oracle data.
-->

---
type: review
id: payment-5xx-charge-review
source_trace: .swarm/generated/traces/payment-5xx-charge-trace.md
source_spec: .swarm/sources/specs/payment-5xx.swarm.md
---

# Review: payment-5xx charge

## Per-obligation verdicts

VERDICT IF-001: PASS
REASON The charge-card interface contract holds — the `charge-card-contract` contract proof verifies the declared request/response shape (a required `VERIFY BY` binding; an INTERFACE in scope is a judged obligation at the merge gate). The gate still BLOCKS below on the CONTRADICTED invariant, independent of this PASS.
EVIDENCE contract:cmdContract:charge-card-contract passed

VERDICT AC-020: PASS (CONTRADICTED by review: bounded-retry test and the production duplicate-captures monitor disagree about the no-double-charge property)
REASON Bounded-retry harness test PASSes, but the production monitor observes duplicate captures on the same key; the two proofs disagree about the no-double-charge property.
EVIDENCE test:cmdTest:payment-5xx.spec.ts#retries-bounded passed
EVIDENCE monitor:cmdMonitor:duplicate-captures#zero_double_captures failed

VERDICT AC-021: PASS
REASON Budget-exhaustion test asserts a 502 with the structured `processor-unavailable` body returned inside the 30s budget.
EVIDENCE payment-fail.spec.ts output in review log

VERDICT I-001: FAIL (CONTRADICTED by review: the production duplicate-captures monitor contradicts the bounded-retry test on the no-double-charge property)
REASON Production duplicate-captures count is non-zero over the window, contradicting the harness test that exercises a single-flight retry path.
EVIDENCE monitor:cmdMonitor:duplicate-captures#zero_double_captures failed
EVIDENCE test:cmdTest:payment-5xx.spec.ts#retries-bounded passed

## Final verdict
Gate: every required obligation is PASS or WAIVED; none STALE/CONTRADICTED/FAIL/BLOCKED/UNVERIFIED.
Result: BLOCKED — AC-020 and I-001 are CONTRADICTED (and I-001's core is FAIL). The `test`
PASS outranks the `monitor` FAIL in the proof-strength preorder and is the working assumption,
but a CONTRADICTED required obligation blocks the gate until the disagreement is reconciled
(see [../../../passes/review.md](../../../passes/review.md)) — contradiction is never resolved by picking the more convenient result.

## Reconcile note
Reconcile applied (the not-silent discipline, see [../../../passes/review.md](../../../passes/review.md)). The disagreeing proofs were re-examined,
not picked between: the harness test exercised retries on a *single* in-flight request, so it
never witnessed the real defect — two concurrent requests for the same idempotency key both
passed the not-yet-persisted-key check and each captured a charge. The code was fixed with a
single-flight guard that persists the idempotency key before any capture, server/src/payments/charge.ts
was edited, and both proofs were re-run against the new surface: the bound `test`
`payment-5xx.spec.ts#retries-bounded` (extended with a concurrent-request case) PASSed and the
`monitor` `duplicate-captures#zero_double_captures` window now reports zero double captures.
The two proofs now agree, so the CONTRADICTED decorator drops from AC-020 and I-001, I-001
resolves to a clean PASS, and with every required obligation PASS the merge gate opens: final
outcome PASS. Note (see [../../../passes/review.md](../../../passes/review.md)): the contradiction was closed only when both proofs agreed — never
by silently trusting the stronger oracle's working assumption.
