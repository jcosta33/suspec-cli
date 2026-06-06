<!--
checkout golden-corpus fixture — Stage 7 (review + merge gate, pass: review, run under the
`skeptic` profile). The `review` pass consumes the trace and emits one per-obligation VERDICT
line carrying a core value optionally decorated with a lifecycle value. All seven obligations
(incl. the IF-010 interface contract) are clean PASS: each verdict is judged against the source
spec, the diff, and the proof evidence —
not the trace's self-report. The unauthorized-change check confirms no diff hunk wrote outside
its packet's WRITES surface, and the two packets' write surfaces are disjoint — so the
safe-parallelism predicate that the authored source violated (SOL-O001) now holds. With every
required obligation PASS, the merge gate opens: final outcome PASS, no reconcile needed. Inert
oracle data.
-->

---
type: review
id: checkout-review
source_trace: .swarm/generated/traces/checkout-trace.md
source_spec: .swarm/sources/specs/checkout.swarm.md
---

# Review: checkout

## Per-obligation verdicts

VERDICT IF-010: PASS
REASON The checkout interface contract holds — the `openapi/checkout.yaml` contract proof validates the declared request/response shape (a required `VERIFY BY` binding; an INTERFACE in scope is a judged obligation at the merge gate).
EVIDENCE cmdValidate openapi/checkout.yaml output in review log

VERDICT AC-010: PASS
REASON `validates-cart` exercises a submitted cart and asserts validation runs before any charge.
EVIDENCE checkout.spec.ts validates-cart output in review log

VERDICT AC-013: PASS
REASON `charges-card` exercises the charge path; the diff in submit.ts charges exactly once.
EVIDENCE checkout.spec.ts charges-card output in review log

VERDICT AC-014: PASS
REASON `emails-receipt` asserts a receipt is sent after a successful charge.
EVIDENCE checkout.spec.ts emails-receipt output in review log

VERDICT AC-011: PASS
REASON `writes-order` asserts the order record is persisted to db/orders.
EVIDENCE order-record.spec.ts writes-order output in review log

VERDICT AC-012: PASS
REASON `writes-ledger` asserts the inventory ledger is persisted to the disjoint db/inventory surface, serialized behind AC-011.
EVIDENCE inventory.spec.ts writes-ledger output in review log

VERDICT I-010: PASS
REASON Property test fails on any path producing charge_count > 1; current run is green.
EVIDENCE checkout.properties.ts charge_at_most_once output in review log

## Unauthorized-change check
No diff hunk wrote outside its packet's declared WRITES. The `checkout-submit` packet touched
only api/src/checkout/submit.ts and db/orders; the `checkout-inventory` packet touched only
db/inventory. The two write surfaces are pairwise disjoint and AC-012 is ordered behind AC-011,
so the safe-parallelism predicate holds — the SOL-O001 conflict the authored source carried is
cleared, not merely re-marked.

## Final verdict
Gate: every required obligation is PASS or WAIVED; none STALE/CONTRADICTED/FAIL/BLOCKED/UNVERIFIED.
Result: PASS — seven required obligations — the IF-010 interface contract, the five REQs
(AC-010, AC-013, AC-014, AC-011, AC-012), and the invariant I-010 — are clean PASS, and no
parallel write-surface conflict remains. The merge gate opens.
