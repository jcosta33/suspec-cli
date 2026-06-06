# PRD anatomy — section-by-section stance rules

A lookup aid for `write-prd`. It restates the `prd.md` artifact contract for convenience; the Swarm artifact contract is authoritative on any disagreement. Every rule below defends one boundary: a `prd.md` asserts **intent** (what outcome is wanted and why) and is **non-authoritative until authored** into a `spec.swarm.md`. It carries no obligations of its own.

## Frontmatter

```yaml
type: prd          # fixed; identifies the artifact class
id: <slug>         # stable identifier; the citable name for this intent
status: draft      # one of: draft | accepted | superseded
created: <date>    # authoring date
updated: <date>    # last-revision date
```

The `id` is the name the author pass and every downstream obligation cite back to. `status` moves draft → accepted → superseded as the intent is ratified or replaced.

## The seven sections, in order

| # | Section | What it asserts | Stance rule |
|---|---------|-----------------|-------------|
| 1 | `## Problem` | The user or business problem, in plain prose. | States what is wrong or missing — never how to fix it. |
| 2 | `## Users` | Who is affected and which segment the outcome serves. | Identifies the affected population; asserts no behaviour. |
| 3 | `## Goals` | The outcomes that define success. | Outcome statements only; never obligation blocks, and never a mechanism. |
| 4 | `## Non-goals` | The outcomes explicitly out of scope — the boundary of intent. | Mandatory; MUST NOT be empty. An absent boundary is a defect. |
| 5 | `## Success metrics` | Measurable signals that a goal was met. | A table; each metric SHOULD name how it is observed, so it can later seed an observable proof. |
| 6 | `## Release constraints` | Date, rollout, compliance, or dependency limits on shipping. | Constraints on *delivery* — never authored obligation blocks. |
| 7 | `## Linked evidence` | References to the research and findings that ground the intent. | Cross-file refs use `<source-id>#<local-id>` where an evidence item has a local id. |

Omitting or reordering a required section breaks the contract the author pass relies on.

## The success-metrics table

`## Success metrics` is a table, not a prose list:

```
| Metric | Target | How observed (future monitor: proof) |
| ------ | ------ | ------------------------------------ |
```

Each row is the seed of a future observable check. When the PRD promotes, a metric that already names *how it is observed* can later bind a proof on the obligation it justified; a metric with no observation column strands its goal with no path to proof. Write the observation now — it is the cheapest place to make a goal verifiable later.

## Filename and placement

- A `prd.md` is a **working artifact**: plain `.md`, and its filename **MUST NOT** contain the `.swarm.` infix. That infix marks compiler-visible files (the one human-authored source spec is `*.swarm.md`; emitted artifacts take `*.swarm.*` names). A PRD is neither — it is a hand-authored source that *feeds* a spec, never parsed or emitted by a compiler.
- In an adopted project it is a **durable source** and lives under the workspace `sources/` tree, beside the other parents of a spec (specs, RFCs, research, audits, findings, ADRs).
- It is **never** placed under `generated/` (derived execution packets — task frames, traces, reviews) and **never** under `memory/` (durable recall — index, glossary, patterns). Desired-state source belongs in `sources/`.

## Worked example: outcome vs mechanism

The boundary every rule defends. The same intent, on the wrong and the right side of the line.

**Wrong — mechanism and obligation leaking into the PRD:**

```
## Goals
- Add a Redis-backed session cache with a 5-minute TTL.

REQ AC-001:
WHEN a user requests a protected page
THE auth service MUST return the cached session in under 50ms
```

This pre-decides the *how* (Redis, TTL) and authors a `REQ` — letting an intent be read as an approved contract and bypassing the author pass.

**Right — outcome and signal, mechanism deferred to the spec:**

```
## Problem
Returning users are forced to re-authenticate on every page, which drives
drop-off on the checkout flow.

## Goals
- Returning users stay signed in across a session without re-authenticating.
- Protected pages load fast enough that auth is not perceived as a delay.

## Non-goals
- Single sign-on across third-party properties.
- Changing the password-reset flow.

## Success metrics
| Metric | Target | How observed (future monitor: proof) |
| ------ | ------ | ------------------------------------ |
| Re-auth prompts per session | ≤ 1 | session-event telemetry |
| Protected-page p95 latency | < 200ms | request-latency dashboard |
```

The goals state outcomes; the metrics name how each is observed; the mechanism (cache, store, TTL) is left for the `author` pass to author into the spec as obligations, where it can be weighed and bound to proof.
