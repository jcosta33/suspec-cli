<!--
auth-refresh golden-corpus POSITIVE fixture — Stage 5 (work packet, passes: decompose, implement).
The `decompose` pass projects the IR into a work packet whose write surfaces are a subset of
the assigned obligations' WRITES (the two-tier lowering rule, see ../../../passes/lower.md; a packet writing a
path outside its declared WRITES is SOL-O005, G7). The `implement` pass executes it. Only the
load-bearing frame is shown. Inert oracle data — Swarm runs nothing.
-->

---
type: task
id: auth-refresh-client
status: active
task_kind: feature
source: .swarm/sources/specs/auth-refresh.swarm.md
assigned_obligations: [AC-001, AC-002]
invariants: [I-001]
interfaces: [IF-001]
write_surfaces: [web/src/http/client.ts]
verification_bindings:
  - AC-001: test:cmdTest:web/tests/auth-refresh-401.spec.ts#replays-after-refresh
  - AC-002: test:cmdTest:web/tests/auth-refresh-expired.spec.ts#clears-and-redirects
  - I-001:  property:cmdTest:web/tests/auth-refresh.properties.ts#no_unbounded_retry
parallel_group: client-edits
blocked_by: []
---

# Task: Implement auth-refresh client behavior

## Scope

### In
- Implement AC-001, AC-002, and preserve I-001 within web/src/http/client.ts.

### Out
- Do not implement unassigned obligations.
- Do not change behavior outside web/src/http/client.ts.

## Verification matrix
| Obligation | Required proof              | Actual proof                          | Status |
| ---------- | --------------------------- | ------------------------------------- | ------ |
| AC-001     | test:#replays-after-refresh | auth-refresh-401.spec.ts passed       | pass   |
| AC-002     | test:#clears-and-redirects  | auth-refresh-expired.spec.ts passed   | pass   |
| I-001      | property:#no_unbounded_retry| auth-refresh.properties.ts passed     | pass   |
