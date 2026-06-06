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
payment-5xx golden-corpus POSITIVE fixture — Stage 3 (improved source, pass: improve).
The `improve` pass applied the closed, intent-preserving ops (see [../../../passes/improve.md](../../../passes/improve.md)):
  - DECONFLICT resolved AC-020's MUST-retry / MUST-NOT-retry contradiction. The owner's
               intent was a *bounded* retry, never an unconditional one: AC-020 becomes
               "retry at most 3 times under the same idempotency key", and the no-double-
               charge concern moves onto its own INVARIANT (I-001). Clears SOL-M002.
  - CONCRETIZE replaced AC-021's "handle failures gracefully" with an observable criterion
               (return HTTP 502 with a structured error body inside the 30s budget). Clears
               SOL-P005.
  - BIND       attached a `test` proof to AC-020 and a `monitor` proof to I-001 — a
               no-double-charge property whose only honest oracle is a production-ledger
               observation (a unit test cannot witness a real duplicate capture). IF-001
               (its `contract` proof) and AC-021 (its `test` proof) already carried their
               bindings in the authored source; CONCRETIZE only reworded AC-021's selector
               (surfaces-error → surfaces-502). Clears the bindings the seeded defects left open.
Q-001 was resolved out-of-band by the spec owner (decision: retry automatically up to the
bound, then surface a 502 to the user); the resolution is recorded and Q-001 is removed,
unblocking AC-020 before lowering. After improve the contradiction and the vague clause clear
and no blocking QUESTION remains. Still inert oracle data.
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
THE payments service MUST retry the charge at most 3 times under the same idempotency key
VERIFY BY test:cmdTest:server/tests/payment-5xx.spec.ts#retries-bounded
DEPENDS ON IF-001
AFFECTS I-001
WRITES server/src/payments/charge.ts
RISK high

REQ AC-021:
WHEN the retry budget for a charge is exhausted
THE payments service MUST return HTTP 502 with a structured `processor-unavailable` error body within the 30s request budget
VERIFY BY test:cmdTest:server/tests/payment-fail.spec.ts#surfaces-502
DEPENDS ON IF-001
WRITES server/src/payments/charge.ts
RISK medium

## Invariants

INVARIANT I-001:
the same idempotency key MUST NOT result in more than 1 captured charge
VERIFY BY monitor:cmdMonitor:dashboards/payments/duplicate-captures#zero_double_captures
