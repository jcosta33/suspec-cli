<!--
auth-refresh golden-corpus POSITIVE fixture — Stage 7 (review + merge gate, pass: review,
run under the `skeptic` profile). The `review` pass consumes the trace and emits
per-obligation VERDICT lines carrying a core value optionally decorated with a lifecycle
value (see [the verdict model](../../../passes/review.md)). IF-001 (the interface contract), AC-001, and I-001 are clean PASS. AC-002 carries the STALE lifecycle decorator:
its bound test PASSed, but web/src/http/client.ts was edited after the recorded PASS, so its
source no longer matches (see [STALE and reconcile](../../../passes/review.md)). A STALE required obligation is NOT mergeable until reconciled,
so the gate is BLOCKED. The reconcile note records option 1 (re-run the bound proof against the
current surface); after re-run AC-002 -> PASS and the gate opens. Inert oracle data.
-->

---
type: review
id: auth-refresh-client-review
source_trace: .swarm/generated/traces/auth-refresh-client-trace.md
source_spec: .swarm/sources/specs/auth-refresh.swarm.md
---

# Review: auth-refresh client

## Per-obligation verdicts

VERDICT IF-001: PASS
REASON The `refreshSession` interface contract holds — the contract proof verifies the `Session | AuthExpired` return and the declared error cases (a required `VERIFY BY` binding; an INTERFACE in scope is a judged obligation at the merge gate).
EVIDENCE refresh-session-contract output in review log

VERDICT AC-001: PASS
REASON Replay-after-refresh test exercises a 401 with a present refresh token and asserts one replay.
EVIDENCE auth-refresh-401.spec.ts output in review log

VERDICT AC-002: PASS (STALE by review: prior-verdict T-001; changed-surface web/src/http/client.ts)
REASON Prior PASS evidence no longer matches current write-surface hash; requires 3-way reconcile.
EVIDENCE prior verdict + changed-surface diff in review log

VERDICT I-001: PASS
REASON Property test fails on any path producing retry_count > 1; current run is green.
EVIDENCE auth-refresh.properties.ts output in review log

## Final verdict
Gate: every required obligation is PASS or WAIVED; none STALE/CONTRADICTED/FAIL/BLOCKED/UNVERIFIED.
Result: BLOCKED — AC-002 is STALE. Re-run the bound proof against the current surface
(reconcile option 1), then re-evaluate. After re-run AC-002 → PASS, the gate opens.

## Reconcile note
Reconcile applied (option 1 of the 3-way reconcile, see [the verdict model](../../../passes/review.md)): the bound proof
`test:cmdTest:web/tests/auth-refresh-expired.spec.ts#clears-and-redirects` was re-run against
the current `web/src/http/client.ts`. The proof passed and the recorded per-surface hash now
matches the live surface; AC-002 drops its STALE decorator and resolves to a clean PASS.
With every required obligation now PASS, the merge gate opens: final outcome PASS.
Note (see [the verdict model](../../../passes/review.md)): a STALE verdict is never silently re-blessed — reconcile re-runs, amends, or fixes
the code; here the re-run produced a fresh matching PASS.
