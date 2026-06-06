---
type: spec
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
id: auth-refresh
status: draft
---

# Spec: Silent token refresh on 401

<!--
auth-refresh golden-corpus POSITIVE fixture — Stage 3 (improved source, pass: improve).
The `improve` pass applied the closed, intent-preserving ops ([improve](../../../passes/improve.md)):
  - NORMALIZE  resolved AC-002 `SHOULD` to `MUST` (the owner judged the session-clear
               mandatory, so no BECAUSE is needed) — clears SOL-S006.
  - CONCRETIZE fixed I-001's threshold to the literal `1` and named the measured
               quantity (the retry count) — clears SOL-P005.
  - BIND       attached a `test` proof to AC-002 and a `property` proof to I-001
               (an INVARIANT prefers property|model|static, see [verify](../../../passes/verify.md)) — clears SOL-V001.
Q-001 was resolved out-of-band by the spec owner (decision: redirect to `/login`);
the resolution is recorded and Q-001 is removed, unblocking AC-002. All other clauses carry
through unchanged (improve is semantics-preserving) — including AC-001's `AFFECTS I-001`, which
lowers to the two affects edges in the IR. After improve all three lint diagnostics clear and no
blocking QUESTION remains. Still inert oracle data.
-->

## Intent
When an access token expires mid-session the client transparently refreshes it
and replays the original request, without ever looping.

## Interfaces

INTERFACE IF-001:
`refreshSession` RETURNS `Session | AuthExpired`
ERRORS:
  - network-timeout
  - invalid-refresh-token
OWNED BY auth-client
VERIFY BY contract:cmdContract:refresh-session-contract

## Obligations

REQ AC-001:
WHEN a request returns 401 AND a refresh token is present
THE auth client MUST call `refreshSession` once
AND THE auth client MUST replay the original request with the new session
VERIFY BY test:cmdTest:web/tests/auth-refresh-401.spec.ts#replays-after-refresh
DEPENDS ON IF-001
WRITES web/src/http/client.ts
AFFECTS I-001
RISK high

REQ AC-002:
WHEN the refresh token is expired
THE auth client MUST clear the local session
AND THE auth client MUST redirect to `/login`
VERIFY BY test:cmdTest:web/tests/auth-refresh-expired.spec.ts#clears-and-redirects
DEPENDS ON IF-001
WRITES web/src/http/client.ts
RISK medium

## Invariants

INVARIANT I-001:
the retry count for a single original request MUST NOT exceed 1
VERIFY BY property:cmdTest:web/tests/auth-refresh.properties.ts#no_unbounded_retry
