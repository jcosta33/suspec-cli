<!--
checkout golden-corpus fixture — Stage 5 (work packets, passes: decompose, implement).
The `decompose` pass projects the IR into work packets whose write surfaces are a subset of
the assigned obligations' WRITES (the two-tier lowering rule; a packet writing a path outside
its declared WRITES is SOL-O005). The checkout IR decomposes into two packets with DISJOINT
write surfaces — `checkout-submit` owns the service code (api/src/checkout/submit.ts) and the
order record (db/orders); `checkout-inventory` owns the inventory ledger (db/inventory) and is
serialized behind `checkout-submit` by `blocked_by`, mirroring the AC-012 DEPENDS ON AC-011
edge. Because the two packets' WRITES are pairwise disjoint and the dependency is explicit, the
safe-parallelism predicate holds and no SOL-O001 fires (this is exactly the defect the authored
source carried; see ../EXPECTED.md). Only the load-bearing frame is shown. Inert oracle data —
Swarm runs nothing.
-->

---
type: task
id: checkout-submit
status: active
task_kind: feature
source: .swarm/sources/specs/checkout.swarm.md
assigned_obligations: [AC-010, AC-013, AC-014, AC-011]
invariants: [I-010]
interfaces: [IF-010]
write_surfaces: [api/src/checkout/submit.ts, db/orders]
verification_bindings:
  - AC-010: test:cmdTest:api/tests/checkout.spec.ts#validates-cart
  - AC-013: test:cmdTest:api/tests/checkout.spec.ts#charges-card
  - AC-014: test:cmdTest:api/tests/checkout.spec.ts#emails-receipt
  - AC-011: test:cmdTest:api/tests/order-record.spec.ts#writes-order
  - I-010:  property:cmdTest:api/tests/checkout.properties.ts#charge_at_most_once
parallel_group: checkout-edits
blocked_by: []
---

# Task: Implement checkout submit, charge, and order-write path

## Scope

### In
- Implement AC-010, AC-013, AC-014, AC-011, and preserve I-010 within
  api/src/checkout/submit.ts and db/orders.

### Out
- Do not implement unassigned obligations.
- Do not write db/inventory (owned by the serialized `checkout-inventory` packet).

## Verification matrix
| Obligation | Required proof              | Actual proof                            | Status |
| ---------- | --------------------------- | --------------------------------------- | ------ |
| AC-010     | test:#validates-cart        | checkout.spec.ts validates-cart passed  | pass   |
| AC-013     | test:#charges-card          | checkout.spec.ts charges-card passed    | pass   |
| AC-014     | test:#emails-receipt        | checkout.spec.ts emails-receipt passed  | pass   |
| AC-011     | test:#writes-order          | order-record.spec.ts writes-order passed| pass   |
| I-010      | property:#charge_at_most_once| checkout.properties.ts passed          | pass   |

## Serialized companion packet (write-disjoint)
The `checkout-inventory` packet covers AC-012, owns the disjoint surface `db/inventory`, and
carries `blocked_by: [checkout-submit]` (the AC-012 DEPENDS ON AC-011 edge). Its binding is
`test:cmdTest:api/tests/inventory.spec.ts#writes-ledger`. Disjoint WRITES + explicit ordering
satisfy the safe-parallelism predicate — the SOL-O001 the authored source tripped is cleared.
