---
type: spec
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
id: payment-5xx
status: draft
---

# Spec: Payment-processor 5xx handling

<!--
payment-5xx golden-corpus POSITIVE fixture — Stage 1 (authored source, pass: author).
This is the only `.swarm.` artifact a human writes (see [../../../templates/spec.swarm.md](../../../templates/spec.swarm.md)); the `.swarm.` infix marks it
human-authored. It is inert oracle data: nothing runs it. As authored it carries the
payment-5xx canonical defect cluster that the `lint` pass (see EXPECTED.md) surfaces —
  SOL-M002 (AC-020 asserts MUST retry AND MUST NOT retry on one trigger — a contradiction),
  SOL-P005 (AC-021 "handle failures gracefully" — a high-risk word, no observable criterion),
plus a blocking QUESTION (Q-001) that, if it reached the `lower` pass unresolved, would be
SOL-O003 (blocking-question-reaches-lowering). The contradiction's deconflict introduces a
no-double-charge idempotency invariant whose only honest oracle is a production observation —
the `monitor` proof type the verify stage exercises.
-->

## Intent
When the payment processor returns a 5xx the service retries the charge a bounded
number of times under the same idempotency key, so a transient processor outage is
absorbed without ever charging the customer twice.

## Interfaces

INTERFACE IF-001:
`chargeCard` ACCEPTS `ChargeRequest` RETURNS `Charge | ProcessorError`
ERRORS:
  - processor-5xx
  - idempotency-conflict
OWNED BY payments-service
VERIFY BY contract:cmdContract:charge-card-contract

## Obligations

REQ AC-020:
WHEN the processor returns a 5xx
THE payments service MUST retry the charge
AND THE payments service MUST NOT retry the charge
AFFECTS I-001

REQ AC-021:
WHEN a payment attempt fails
THE payments service MUST handle failures gracefully
VERIFY BY test:cmdTest:server/tests/payment-fail.spec.ts#surfaces-error

## Invariants

INVARIANT I-001:
the same idempotency key MUST NOT result in more than one captured charge

## Questions

QUESTION Q-001 [blocking]:
Should a 503 from the processor be retried automatically or surfaced to the user for a manual retry?
AFFECTS AC-020
