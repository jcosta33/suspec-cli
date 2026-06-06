<!--
auth-refresh golden-corpus POSITIVE fixture — Stage 6 (trace, pass: verify).
The `verify` pass records a TRACE block plus the provenance the drift join depends on — the
canonical seven fields the [verify pass](../../../passes/verify.md) defines: source_hash
(echoing the IR node content_hash), per_surface_hash[] (each entry {surface, hash, exercised}),
adapter, verdict, tier (the PROOF TYPE per [verify](../../../passes/verify.md), never a RISK
value), origin_obligations[], origin_traces[].
Inert oracle data; the proof results below are recorded, not executed here.
-->

---
type: trace
id: auth-refresh-client-trace
source_task: .swarm/generated/tasks/auth-refresh-client.md
source_spec: .swarm/sources/specs/auth-refresh.swarm.md
---

# Trace: auth-refresh client

TRACE T-001:
IMPLEMENTS IF-001, AC-001, AC-002
PRESERVES I-001
CHANGED web/src/http/client.ts
PROOF contract:cmdContract:refresh-session-contract passed
PROOF test:cmdTest:web/tests/auth-refresh-401.spec.ts#replays-after-refresh passed
PROOF test:cmdTest:web/tests/auth-refresh-expired.spec.ts#clears-and-redirects passed
PROOF property:cmdTest:web/tests/auth-refresh.properties.ts#no_unbounded_retry passed

## Provenance
| binding | source_hash      | per_surface_hash[]                       | adapter | verdict | tier     | origin_obligations | origin_traces |
| ------- | ---------------- | ---------------------------------------- | ------- | ------- | -------- | ------------------ | ------------- |
| IF-001  | sha256:1f4a…c0   | {client.ts, sha256:5510…b3, exercised}   | cmdContract | PASS | contract | [IF-001]           | [T-001]       |
| AC-001  | sha256:9b2e…41   | {client.ts, sha256:5510…b3, exercised}   | cmdTest | PASS    | test     | [AC-001]           | [T-001]       |
| AC-002  | sha256:e8f7…2d   | {client.ts, sha256:5510…b3, exercised}   | cmdTest | PASS    | test     | [AC-002]           | [T-001]       |
| I-001   | sha256:7d10…aa   | {properties.ts, sha256:aa90…1c, exercised}| cmdTest | PASS    | property | [I-001]            | [T-001]       |
