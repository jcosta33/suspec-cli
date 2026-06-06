---
type: spec
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
id: checkout
status: draft
---

# Spec: Cart submission and checkout

<!--
checkout golden-corpus fixture — Stage 1 (authored source, pass: author).
This is the only `.swarm.` artifact a human writes; the `.swarm.` infix marks it
human-authored. It is inert oracle data: nothing runs it. As authored, it carries the
checkout domain's canonical defect class that the `lint` pass (see ../EXPECTED.md) is
expected to surface:
  - SOL-P004 (AC-010 bundles three separable obligations in one REQ — validate the cart
              AND charge the card AND email the receipt) — repaired by improve op ATOMIZE.
  - SOL-O001 (AC-011 and AC-012 share the write surface `db/orders` and are planned in the
              same parallel group, violating the safe-parallelism predicate) — repaired by
              improve op SCOPE.
The positive obligation the negative variant violates — single-charge idempotency — is the
INVARIANT I-010 carried below with a bound property proof.
-->

## Intent
When a shopper submits their cart the service validates it, charges the card, writes the
order and inventory records, and emails a receipt — charging the card at most once.

## Interfaces

INTERFACE IF-010:
`submitCart` RETURNS `OrderConfirmation | CheckoutError`
ERRORS:
  - card-declined
  - cart-expired
OWNED BY checkout-service
VERIFY BY contract:cmdValidate:openapi/checkout.yaml#submitCart

## Obligations

REQ AC-010:
WHEN the cart is submitted
THE checkout service MUST validate the cart AND charge the card AND email the receipt
VERIFY BY test:cmdTest:api/tests/checkout.spec.ts#submit
DEPENDS ON IF-010
AFFECTS I-010
WRITES api/src/checkout/submit.ts
RISK high

REQ AC-011:
WHEN the cart is submitted
THE checkout service MUST write the order record
VERIFY BY test:cmdTest:api/tests/order-record.spec.ts#writes-order
WRITES db/orders
RISK medium

REQ AC-012:
WHEN the cart is submitted
THE checkout service MUST write the inventory ledger
VERIFY BY test:cmdTest:api/tests/inventory.spec.ts#writes-ledger
WRITES db/orders
RISK medium

## Invariants

INVARIANT I-010:
a single submitted cart MUST NOT result in more than one card charge
VERIFY BY property:cmdTest:api/tests/checkout.properties.ts#charge_at_most_once

## Questions

QUESTION Q-010:
Should AC-011 and AC-012 run in one transaction or two?
AFFECTS AC-011
