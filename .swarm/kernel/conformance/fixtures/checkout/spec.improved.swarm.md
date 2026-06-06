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
checkout golden-corpus fixture — Stage 3 (improved source, pass: improve).
The `improve` pass applied the closed, intent-preserving ops:
  - ATOMIZE  split the bundled AC-010 ("validate the cart AND charge the card AND email the
             receipt") into three single-obligation REQs — AC-010 (validate), AC-013 (charge),
             AC-014 (email receipt) — each one obligation per block. Clears SOL-P004. No
             obligation, modality, or VERIFY BY binding is lost: the three predicates keep the
             same trigger, the charge predicate keeps AC-010's high RISK, and each gets its own
             selector on the bound test.
  - SCOPE    deconflicted the AC-011 / AC-012 write-surface collision two ways at once: AC-012
             now writes the disjoint surface `db/inventory` (was `db/orders`), AND a serializing
             `DEPENDS ON AC-011` edge was added (resolving Q-010 in favour of one ordered
             write path). With disjoint surfaces the pair satisfies the safe-parallelism
             predicate; the DEPENDS ON makes the order explicit. Clears SOL-O001.
Q-010 was resolved out-of-band (decision: serialize AC-012 behind AC-011) and removed. After
improve both blocking diagnostics clear and no QUESTION remains. Still inert oracle data.
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
THE checkout service MUST validate the cart
VERIFY BY test:cmdTest:api/tests/checkout.spec.ts#validates-cart
DEPENDS ON IF-010
WRITES api/src/checkout/submit.ts
RISK medium

REQ AC-013:
WHEN the cart is submitted
THE checkout service MUST charge the card
VERIFY BY test:cmdTest:api/tests/checkout.spec.ts#charges-card
DEPENDS ON IF-010
AFFECTS I-010
WRITES api/src/checkout/submit.ts
RISK high

REQ AC-014:
WHEN the cart is submitted
THE checkout service MUST email the receipt
VERIFY BY test:cmdTest:api/tests/checkout.spec.ts#emails-receipt
DEPENDS ON IF-010
WRITES api/src/checkout/submit.ts
RISK low

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
DEPENDS ON AC-011
WRITES db/inventory
RISK medium

## Invariants

INVARIANT I-010:
a single submitted cart MUST NOT result in more than one card charge
VERIFY BY property:cmdTest:api/tests/checkout.properties.ts#charge_at_most_once
