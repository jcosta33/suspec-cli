<!--
payment-5xx golden-corpus POSITIVE fixture — Stage 6 (trace, pass: verify).
The `verify` pass records a TRACE block plus the provenance the drift join depends on — the
canonical seven G11 fields (see [../../../passes/verify.md](../../../passes/verify.md)): source_hash (echoing the IR node content_hash),
per_surface_hash[] (each entry {surface, hash, exercised}), adapter, verdict,
tier (the PROOF TYPE — see [../../../passes/verify.md](../../../passes/verify.md) — never a RISK value), origin_obligations[], origin_traces[].
The AC-020/AC-021 `test` proofs PASS in the harness. The I-001 `monitor` proof reports a
FAIL: the production duplicate-captures dashboard observed a non-zero double-capture count
over the window — runtime evidence that the harness never saw. The harness test (AC-020) and
the production monitor (I-001) thus disagree about the same no-double-charge property, which
the `review` pass will decorate CONTRADICTED (see [../../../passes/review.md](../../../passes/review.md)). Inert oracle data; the proof results
below are recorded, not executed here.
-->

---
type: trace
id: payment-5xx-charge-trace
source_task: .swarm/generated/tasks/payment-5xx-charge.md
source_spec: .swarm/sources/specs/payment-5xx.swarm.md
---

# Trace: payment-5xx charge

TRACE T-001:
IMPLEMENTS IF-001, AC-020, AC-021
PRESERVES I-001
CHANGED server/src/payments/charge.ts
PROOF contract:cmdContract:charge-card-contract passed
PROOF test:cmdTest:server/tests/payment-5xx.spec.ts#retries-bounded passed
PROOF test:cmdTest:server/tests/payment-fail.spec.ts#surfaces-502 passed
PROOF monitor:cmdMonitor:dashboards/payments/duplicate-captures#zero_double_captures failed

## Provenance
| binding | source_hash      | per_surface_hash[]                         | adapter    | verdict | tier    | origin_obligations | origin_traces |
| ------- | ---------------- | ------------------------------------------ | ---------- | ------- | ------- | ------------------ | ------------- |
| IF-001  | sha256:2c8d…b1   | {charge.ts, sha256:6b22…9f, exercised}     | cmdContract | PASS | contract | [IF-001]           | [T-001]       |
| AC-020  | sha256:4f6a…e2   | {charge.ts, sha256:6b22…9f, exercised}     | cmdTest    | PASS    | test    | [AC-020]           | [T-001]       |
| AC-021  | sha256:9a01…7c   | {charge.ts, sha256:6b22…9f, exercised}     | cmdTest    | PASS    | test    | [AC-021]           | [T-001]       |
| I-001   | sha256:b730…5d   | {charge.ts, sha256:6b22…9f, exercised}     | cmdMonitor | FAIL    | monitor | [I-001]            | [T-001]       |
