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
auth-refresh golden-corpus POSITIVE fixture — Stage 1 (authored source, pass: author).
This is the only `.swarm.` artifact a human writes (see ../../../templates/spec.swarm.md); the `.swarm.` infix marks it
human-authored. It is inert oracle data: nothing runs it. As authored, it carries three
seeded defects that the `lint` pass (see ../EXPECTED.md) is expected to surface —
SOL-V001 (AC-002 has no VERIFY BY), SOL-S006 (AC-002 SHOULD with no BECAUSE/EXCEPT),
SOL-P005 (I-001 vague-quality predicate) — plus a blocking QUESTION (Q-001) that, if it
reached the `lower` pass unresolved, would be SOL-O003.
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
THE auth client SHOULD clear the local session
AND THE auth client MUST redirect to `/login`

## Invariants

INVARIANT I-001:
the retry count for a single original request MUST NOT exceed one

## Questions

QUESTION Q-001 [blocking]:
Should an expired refresh token redirect to `/login` or open an inline re-auth modal?
AFFECTS AC-002
