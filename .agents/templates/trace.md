---
type: trace
id: {{slug}}-trace
source_task: .swarm/generated/tasks/{{slug}}.md
source_spec: {{spec-id}}.swarm.md
created: {{createdAt}}
---

# Trace: {{title}}

> A trace records implementation *claims* against obligations and binds them to *evidence*. Its core
> payload is one or more `TRACE` blocks plus the G11 drift-provenance fields the staleness join
> (the `review` pass) depends on. No runtime: every hash and verdict here is a content-hash contract a future tool computes —
> nothing runs.

## Claimed implementation

<one bare-header SOL `TRACE` block per claim — `IMPLEMENTS` the obligation, `PRESERVES` the constraints/invariants held, `CHANGED` the touched surfaces, `PROOF` the verification-output reference>

TRACE T-001:
IMPLEMENTS AC-001
PRESERVES C-001
CHANGED <path the claim modified>
PROOF <verification output reference>

TRACE T-002:
IMPLEMENTS AC-002
PRESERVES I-001
CHANGED <path>
PROOF <verification output reference>

## Provenance

<the canonical seven G11 fields **per binding** — this is what flips a PASS to STALE when source or surface drifts (see the `review` pass); the recording timestamp lives in the frontmatter `created`, not here>

- `source_hash` — content hash of the obligation source (the exact bytes of the obligation block in `*.swarm.md`) at the time of the PASS.
- `per_surface_hash[]` — one `{surface, hash, exercised}` per declared `WRITES` surface **and** per `READS` surface the proof exercised (see the `review` pass); `exercised: true` iff the proof actually executed/analysed that surface.
- `adapter` — the `cmd*` slot the proof resolved through (see the `verify` pass).
- `verdict` — the core verdict recorded (`PASS` for a drift-trackable binding).
- `tier` — the proof type (see the `verify` pass), same value as `type` in the IR `verify_by[]` element.
- `origin_obligations[]` — the obligation IDs this PASS judged.
- `origin_traces[]` — the trace(s) that produced the change being judged.

| Binding | source_hash | per_surface_hash[] | adapter | verdict | tier | origin_obligations[] | origin_traces[] |
| ------- | ----------- | ------------------ | ------- | ------- | ---- | -------------------- | --------------- |
| AC-001  | sha256:…    | {{surface}}:sha256:… (exercised: true/false) | {{cmd*}} | PASS | {{tier}} | AC-001 | T-001 |
| AC-002  |             |                    |         | PASS    |      |                      |                 |

## Verification matrix

<ID → required proof → actual proof → 7-value status; status ∈ PASS / FAIL / BLOCKED / UNVERIFIED (the four core verdicts; see the `review` pass) — a STALE / WAIVED / CONTRADICTED lifecycle decorator is recorded at review time, not claimed here>

| ID     | Required proof | Actual proof | Status |
| ------ | -------------- | ------------ | ------ |
| AC-001 |                |              | PASS / FAIL / BLOCKED / UNVERIFIED |
| AC-002 |                |              | PASS / FAIL / BLOCKED / UNVERIFIED |

## Unassigned changes

<any change outside the assigned obligations, with a reason + the authorizing ID, or `none`>

| Change | Reason | Authorized by |
| ------ | ------ | ------------- |
|        |        | AC/C/I/IF ID or `none` |

## Promotion items

<discoveries to promote, with target + status>

| Discovery | Target | Status |
| --------- | ------ | ------ |
|           |        |        |
