<!--
checkout golden-corpus fixture — Stage 8 (promotion, pass: promote).
With the gate open and the work merged, a durable discovery from the task is promoted into a
finding carrying full provenance: origin_obligations, origin_traces, the pass+profile that
produced it, reviewer/tool, content_hash, confidence, and applies-when bounds. The discovery
surfaced when ATOMIZE split the bundled AC-010 into separate charge (AC-013) and order-write
(AC-011) obligations: those two must commit atomically or a partial failure (charge succeeds,
order-write fails) silently violates I-010's single-charge guarantee on the retry. The
memory/INDEX.md MAP gains one link with a "Load when" condition; no procedure is inlined there.
Inert oracle data.
-->

---
type: finding
id: charge-and-order-write-must-be-atomic
status: promoted
related_obligations: [AC-013, AC-011, I-010]
confidence: high
---

# Finding: The card charge and the order-record write must commit atomically

## Claim
Once AC-010's bundle was atomized, the charge (AC-013) and the order-write (AC-011) became
separately schedulable steps. If the charge commits but the order-write fails, a client retry
re-submits the cart and charges the card a second time — violating I-010 in aggregate even
though each individual submit charges at most once. The two steps MUST share one transaction (or
an idempotency key on the charge) so a failed order-write rolls the charge back.

## Provenance
- origin_obligations: [REQ.checkout.AC-013, REQ.checkout.AC-011, INVARIANT.checkout.I-010]
- origin_traces: [checkout-trace#T-010]
- pass: verify; profile: skeptic
- reviewer_or_tool: review.md (human review)
- content_hash: sha256:5c2a…34
- confidence: high

## Applies when
- The charge step and the order-record write are scheduled as separate steps.
- A submitted cart can be retried after a partial failure.

## Does not apply when
- The charge carries an idempotency key keyed to the cart submission.
- The charge and order-write share a single committed transaction.

---

The promotion also adds one recall link to the memory MAP (the index says *when to load* the
entry; it never inlines the finding's procedure):

```text
# memory/INDEX.md  (excerpt)
- [Charge and order-write must be atomic](../findings/charge-and-order-write-must-be-atomic.md)
  — Load when: implementing or reviewing a checkout/payment path that charges then persists.
```
