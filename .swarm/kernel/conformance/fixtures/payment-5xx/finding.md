<!--
payment-5xx golden-corpus POSITIVE fixture — Stage 8 (promotion, pass: promote).
After reconcile (the CONTRADICTED between the bounded-retry test and the duplicate-captures
monitor closed once both proofs agreed, gate open), a durable discovery from the task is
promoted into a finding carrying full provenance (per the finding schema in
[../../../templates/finding.md](../../../templates/finding.md)): origin_obligations,
origin_traces, the pass+profile that produced it, reviewer/tool, content_hash, confidence,
and applies-when bounds. The memory/INDEX.md MAP gains one link with a "Load when" condition;
no procedure is inlined there (see [../../../passes/promote.md](../../../passes/promote.md)). Inert oracle data.
-->

---
type: finding
id: idempotency-key-required-on-5xx-retry
status: promoted
related_obligations: [AC-020, I-001]
confidence: high
---

# Finding: A 5xx retry without an idempotency key risks a double-capture

## Claim
Retrying a charge after a processor 5xx without carrying — and persisting — a single
idempotency key risks double-capturing the customer: the first attempt may have captured
before the 5xx was returned, and a naive retry captures again. The defect the harness test
never witnessed was concurrent requests racing before the key persisted; a single-flight
guard that persists the idempotency key before any capture is the lesson, and it is what
keeps a bounded retry (AC-020) from violating the no-double-charge invariant (I-001).

## Provenance
- origin_obligations: [REQ.payment-5xx.AC-020, INVARIANT.payment-5xx.I-001]
- origin_traces: [payment-5xx-charge-trace#T-001]
- pass: verify; profile: skeptic
- reviewer_or_tool: review.md (human review)
- content_hash: sha256:4f6a…e2
- confidence: high

## Applies when
- A charge is retried after a processor 5xx, and multiple requests for the same key can be in flight.

## Does not apply when
- The idempotency key is persisted before any capture and a single-flight guard serializes retries on that key.

---

The promotion also adds one recall link to the memory MAP (the index says *when to load*
the entry; it never inlines the finding's procedure, see [../../../passes/promote.md](../../../passes/promote.md)):

```text
# memory/INDEX.md  (excerpt)
- [Idempotency key required on 5xx retry](../findings/idempotency-key-required-on-5xx-retry.md)
  — Load when: implementing or reviewing a payment retry path that re-submits a charge after a 5xx.
```
