<!--
checkout golden-corpus fixture — Stage 6 (trace, pass: verify).
The `verify` pass records a TRACE block per work packet plus the provenance the drift join
depends on — the canonical seven fields: source_hash (echoing the IR node content_hash),
per_surface_hash[] (each entry {surface, hash, exercised}), adapter, verdict, tier (the PROOF
TYPE, never a RISK value), origin_obligations[], origin_traces[]. T-010 covers the submit
packet; T-011 covers the serialized inventory packet. Inert oracle data; the proof results
below are recorded, not executed here.
-->

---
type: trace
id: checkout-trace
source_task: .swarm/generated/tasks/checkout-submit.md
source_spec: .swarm/sources/specs/checkout.swarm.md
---

# Trace: checkout

TRACE T-010:
IMPLEMENTS IF-010, AC-010, AC-013, AC-014, AC-011
PRESERVES I-010
CHANGED api/src/checkout/submit.ts, db/orders
PROOF contract:cmdValidate:openapi/checkout.yaml passed
PROOF test:cmdTest:api/tests/checkout.spec.ts#validates-cart passed
PROOF test:cmdTest:api/tests/checkout.spec.ts#charges-card passed
PROOF test:cmdTest:api/tests/checkout.spec.ts#emails-receipt passed
PROOF test:cmdTest:api/tests/order-record.spec.ts#writes-order passed
PROOF property:cmdTest:api/tests/checkout.properties.ts#charge_at_most_once passed

TRACE T-011:
IMPLEMENTS AC-012
CHANGED db/inventory
PROOF test:cmdTest:api/tests/inventory.spec.ts#writes-ledger passed

## Provenance
| binding | source_hash      | per_surface_hash[]                          | adapter     | verdict | tier     | origin_obligations | origin_traces |
| ------- | ---------------- | ------------------------------------------- | ----------- | ------- | -------- | ------------------ | ------------- |
| IF-010  | sha256:2a7c…d0   | {openapi/checkout.yaml, sha256:a110…b2, exercised} | cmdValidate | PASS | contract | [IF-010]           | [T-010]       |
| AC-010  | sha256:4b1f…12   | {submit.ts, sha256:a110…b2, exercised}      | cmdTest     | PASS    | test     | [AC-010]           | [T-010]       |
| AC-013  | sha256:5c2a…34   | {submit.ts, sha256:a110…b2, exercised}      | cmdTest     | PASS    | test     | [AC-013]           | [T-010]       |
| AC-014  | sha256:6d3b…56   | {submit.ts, sha256:a110…b2, exercised}      | cmdTest     | PASS    | test     | [AC-014]           | [T-010]       |
| AC-011  | sha256:7e4c…78   | {db/orders, sha256:b220…c3, exercised}      | cmdTest     | PASS    | test     | [AC-011]           | [T-010]       |
| AC-012  | sha256:8f5d…9a   | {db/inventory, sha256:c330…d4, exercised}   | cmdTest     | PASS    | test     | [AC-012]           | [T-011]       |
| I-010   | sha256:3b90…ee   | {checkout.properties.ts, sha256:d440…e5, exercised} | cmdTest | PASS  | property | [I-010]            | [T-010]       |
