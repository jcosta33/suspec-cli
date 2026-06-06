<!--
payment-5xx golden-corpus POSITIVE fixture — Stage 5 (work packet, passes: decompose, implement).
The `decompose` pass projects the IR into a work packet whose write surfaces are a subset of
the assigned obligations' WRITES (the two-tier lowering rule, [lower](../../../passes/lower.md); a packet writing a
path outside its declared WRITES is SOL-O005, G7). AC-020 and AC-021 share the single write
surface server/src/payments/charge.ts, so they form one serial packet (no parallel split to
guard). The `implement` pass executes it. I-001 is verified by a `monitor` proof, which has no
merge-time execution (see [verify](../../../passes/verify.md)) — so its row is `pending` here and resolves at the verify/review
stage from the production dashboard, not from this packet. Only the load-bearing frame is
shown. Inert oracle data — Swarm runs nothing.
-->

---
type: task
id: payment-5xx-charge
status: active
task_kind: feature
source: .swarm/sources/specs/payment-5xx.swarm.md
assigned_obligations: [AC-020, AC-021]
invariants: [I-001]
interfaces: [IF-001]
write_surfaces: [server/src/payments/charge.ts]
verification_bindings:
  - AC-020: test:cmdTest:server/tests/payment-5xx.spec.ts#retries-bounded
  - AC-021: test:cmdTest:server/tests/payment-fail.spec.ts#surfaces-502
  - I-001:  monitor:cmdMonitor:dashboards/payments/duplicate-captures#zero_double_captures
parallel_group: payments-edits
blocked_by: []
---

# Task: Implement payment-5xx retry and idempotency behavior

## Scope

### In
- Implement AC-020 (bounded retry under the same idempotency key) and AC-021 (502 on
  budget exhaustion), and preserve I-001 (no double capture) within server/src/payments/charge.ts.

### Out
- Do not implement unassigned obligations.
- Do not change behavior outside server/src/payments/charge.ts.

## Verification matrix
| Obligation | Required proof                | Actual proof                              | Status  |
| ---------- | ----------------------------- | ----------------------------------------- | ------- |
| AC-020     | test:#retries-bounded         | payment-5xx.spec.ts passed                | pass    |
| AC-021     | test:#surfaces-502            | payment-fail.spec.ts passed               | pass    |
| I-001      | monitor:#zero_double_captures | duplicate-captures dashboard (no execution at merge) | pending |
