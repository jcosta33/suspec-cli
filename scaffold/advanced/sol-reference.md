# SOL — structured requirements reference card

<!-- Optional. SOL is Swarm's stricter spec surface — select it per file with
     `format: sol` in the spec's frontmatter. Use it for high-risk work where the
     extra precision pays; the plain `### AC-NNN` form is the default. -->

## A requirement block

```
REQ AC-001:
WHEN the refresh token is expired
THE client MUST clear the local session
AND THE client MUST redirect to `/login`
VERIFY BY test:cmdTest:auth-refresh-expired-token
```

- Header: `REQ AC-001:` — type, id, trailing colon. Body ends at a blank line.
- Conditions, in order, all optional: `WHERE` (feature gate) · `WHILE` (state) ·
  `WHEN` (trigger) · `IF` (fault).
- Consequence: `THE <actor> <STRENGTH> <observable behavior>`; chain more with
  `AND THE …`.
- Strength words (uppercase only): `MUST` · `MUST NOT` · `SHOULD` (needs a same-block
  `BECAUSE`) · `SHOULD NOT` (same) · `MAY`. Lowercase must/should is prose.
- Every requirement carries a `VERIFY BY <method>:<adapter>:<artifact>` line —
  method is one of: static · test · contract · property · model · perf · security ·
  manual · monitor; adapter names a row in your `AGENTS.md` Commands table.

## The other block types

```
CONSTRAINT C-001:
THE auth client MUST NOT import from `server/*`
BECAUSE the client bundle must not embed server-only secrets
VERIFY BY static:lint:dependency-boundary

INVARIANT I-001:
A user MUST NOT have more than one active refresh-token family
VERIFY BY property:test:token-family

INTERFACE IF-001:
`refreshSession` RETURNS `Session | AuthExpired`
OWNED BY auth-client
VERIFY BY contract:contract:refresh-session

QUESTION Q-001 [blocking]:
Should expired sessions redirect or show an inline modal?
AFFECTS AC-001
```

- `CONSTRAINT` (C-) restricts how; `INVARIANT` (I-) always holds — prefer
  property/model/static verification; `INTERFACE` (IF-) declares a boundary —
  verify with a contract check; `QUESTION` (Q-) marks ambiguity — a `[blocking]`
  question means the spec is not `status: ready`.

## Optional metadata (planning hints, after VERIFY BY)

`DEPENDS ON <ids>` · `WRITES <paths>` · `READS <paths>` · `AFFECTS <ids/paths>` ·
`RISK low|medium|high|critical`

## Rules of thumb

- One behavior per block; split bundles.
- IDs are stable; cross-file references read `SPEC-x#AC-001`.
- Both surfaces (plain and SOL) encode the same requirement record — same IDs, same
  strength words, same verification refs. Reviews and checks treat them identically.
- This card is a convention reference — nothing here is enforced by a tool; the
  `spec-check` guide (and a future `swarm spec check`) covers the checklist.
