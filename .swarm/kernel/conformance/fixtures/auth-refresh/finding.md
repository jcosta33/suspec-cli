<!--
auth-refresh golden-corpus POSITIVE fixture — Stage 8 (promotion, pass: promote).
After reconcile (AC-002 re-run -> PASS, gate open), a durable discovery from the task is
promoted into a finding carrying full provenance (mandated by [the promote pass](../../../passes/promote.md);
schema in [the finding template](../../../templates/finding.md)): origin_obligations,
origin_traces, the pass+profile that produced it, reviewer/tool, content_hash, confidence,
and applies-when bounds. The memory/INDEX.md MAP gains one link with a "Load when" condition;
no procedure is inlined there (see [the promote pass](../../../passes/promote.md)). Inert oracle data.
-->

---
type: finding
id: refresh-storm-on-shared-401
status: promoted
related_obligations: [AC-001, I-001]
confidence: high
---

# Finding: A single expired token can fan out to N concurrent 401s

## Claim
Concurrent in-flight requests each see the 401 and independently call refreshSession;
without a single-flight guard this violates I-001 in aggregate even though each request
retries at most once.

## Provenance
- origin_obligations: [REQ.auth-refresh.AC-001, INVARIANT.auth-refresh.I-001]
- origin_traces: [auth-refresh-client-trace#T-001]
- pass: verify; profile: skeptic
- reviewer_or_tool: review.md (human review)
- content_hash: sha256:9b2e…41
- confidence: high

## Applies when
- Multiple requests can be in flight when a token expires.

## Does not apply when
- The client serializes all auth-bearing requests.

---

The promotion also adds one recall link to the memory MAP (the index says *when to load*
the entry; it never inlines the finding's procedure, per [the promote pass](../../../passes/promote.md)):

```text
# memory/INDEX.md  (excerpt)
- [Refresh storm on shared 401](../findings/refresh-storm-on-shared-401.md)
  — Load when: implementing or reviewing concurrent token-refresh paths.
```
