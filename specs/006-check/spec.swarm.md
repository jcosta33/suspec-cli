---
type: spec
id: check
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm check — the repo-wide merge-gate verdict over the specs (src/modules/Commands)
owners: []
imports: [swarm-cli, sol-parser, sol-lint]
domain: architecture
created: 2026-06-08
updated: 2026-06-08
---

# Spec: swarm check — the repo-wide merge-gate verdict

## Intent

`swarm check` is the operator-facing **repository verification gate**: it parses every
`specs/*/spec.swarm.md` through the `Sol` core module (`parse_spec`), runs the five-layer lint diagnostics
over each, and renders **one repo verdict** — `clean` or `blocking` — with a **CI-meaningful exit code**
(non-zero iff `blocking`). It is the operator-facing sibling of `lint` (`sol-lint`, which checks one file):
`lint` reports on a single spec; `check` checks the whole repo's spec set and is the natural home of the
merge-gate predicate (`reference/proofs.md` — the one normative gate; ADR-0055's empty-set floor and
adequacy-for-high-`RISK`). It is a `Commands` use-case on the one dispatch path (`swarm-cli` IF-001's
canonical surface), consuming `Sol` through that module's root barrel; it never re-implements SOL semantics.

This spec fixes **v1 scope**: discover + parse + lint every spec, aggregate to a single repo verdict, and
expose it as an exit code. The full proof-rerun model — re-running each obligation's bound `VERIFY BY`
proofs, the 7-value verdict model, and the `STALE`/`CONTRADICTED` lifecycle — is the `verify`/`review`
machinery and is **out of scope here** (Q-001), not obligated in v1.

## Non-goals

- Not the per-obligation proof rerun, the 7-value verdict model, or the `STALE`/`CONTRADICTED`/`WAIVED`
  lifecycle — that is the `verify`/`review` step's machinery (Q-001). `check` v1 renders the gate over
  *parse + lint* diagnostics only, not over re-run obligation proofs.
- Not parsing or linting themselves — the IR (`sol-parser`) and the diagnostic set + per-file verdict
  (`sol-lint`) are owned upstream; `check` consumes both and aggregates across files.
- Not repairing a spec — `improve`/`format` repair; `check` reports a verdict and never edits a source.
- Not defining the verdict vocabulary, the merge gate, or the lint catalogue — those are the Swarm language
  reference's (`reference/sol.md`, `reference/proofs.md`); this spec binds the command to *apply* them.
- Not workspace discovery beyond the `specs/` tree, agent dispatch, or worktree leasing — separate concerns.

## Context

A **`Commands` use-case** (`src/modules/Commands`), one tool, code in `/src` (ADR-0001: no monorepo). It
consumes the `Sol` core module through that module's root barrel (`parse_spec`, `lint`); the dependency edge
`Commands → Sol` is allowed, and `Sol` — a core module under `core-isolation` — MUST NOT depend on
`Commands`/`Terminal` (`swarm-cli` C-002, made concrete for this command). The repo verdict values
(`clean`/`blocking`) and the merge-gate predicate are fixed by `reference/proofs.md` (the gate) and
`reference/sol.md` (the closed sets); the per-file lint verdict (`clean`/`advisory`/`blocking`) is
`sol-lint` IF-002. Errors use the repo's `Result` + `AppError` (`src/infra/errors`). The exit-code contract
mirrors `sol-lint` AC-006 (non-zero iff `blocking`), lifted from one file to the repo.

## Interfaces

INTERFACE IF-001:
`check` RETURNS `Result<CheckReport, CheckFailure>`
ACCEPTS:
  - `root: string` (the repository root containing the `specs/` tree)
ERRORS:
  - CheckFailure(reason=no-specs-found)
  - CheckFailure(reason=spec-unparseable)
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/check.spec.ts#returns_report_over_repo

INTERFACE IF-002:
`CheckReport` RETURNS `{ specs: SpecResult[], summary: { by_verdict }, verdict, exit_code }`
ACCEPTS:
  - `verdict: clean | blocking`
OWNED BY Commands
VERIFY BY contract:cmdTest:src/modules/Commands/__tests__/check.spec.ts#report_matches_schema

## Obligations

REQ AC-001:
WHEN `swarm check` runs against a repository root
THE command MUST discover and parse every `specs/*/spec.swarm.md` through the `Sol` module's `parse_spec`, and run the lint diagnostics over each parsed spec
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#parses_and_lints_every_spec
DEPENDS ON IF-001
READS specs/**
RISK high

REQ AC-002:
THE command MUST aggregate the per-spec lint outcomes into one repo `verdict` — `blocking` when any spec's lint verdict is `blocking` (or a spec is unparseable), else `clean`
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#repo_verdict_aggregates_per_spec
DEPENDS ON IF-002
RISK high

REQ AC-003:
WHEN `swarm check` is invoked as a process
THE command's exit code MUST be non-zero if and only if the repo `verdict` is `blocking`
BECAUSE a clean repo must not fail CI and a blocking repo must, so the verdict is actionable as a CI merge gate
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#nonzero_iff_blocking
DEPENDS ON AC-002
RISK high

REQ AC-004:
WHEN a spec under `specs/*/` cannot be parsed by `parse_spec`
THE command MUST render the repo `verdict` as `blocking` rather than skip that spec or pass the repo
BECAUSE an unparseable spec is an unchecked obligation surface; silently dropping it would let the gate pass over an unverified spec — the empty-set floor (`reference/proofs.md`: an uncovered change never passes by vacuity; ADR-0055)
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#unparseable_spec_blocks
DEPENDS ON AC-002
RISK high

REQ AC-005:
WHEN the `specs/` tree contains no `spec.swarm.md`
THE command MUST report `no-specs-found` and MUST NOT render a `clean` verdict
BECAUSE a repo with nothing to check passing `clean` is a vacuous pass — the gate's empty-set floor forbids passing by absence of obligations (`reference/proofs.md`; ADR-0055)
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#empty_specs_set_is_not_clean
DEPENDS ON AC-001
RISK medium

REQ AC-006:
THE command's report SHOULD attribute each diagnostic to its originating spec (the `specs/<feature>/` path) so an operator can locate every blocking finding
BECAUSE a single aggregate verdict is unactionable without the per-spec breakdown that points the operator at the file to fix
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#diagnostics_attributed_to_spec
DEPENDS ON AC-002
RISK low

## Constraints

CONSTRAINT C-001:
THE `Sol` module MUST NOT depend on `Commands` or `Terminal`
BECAUSE `check` consumes `Sol` through its barrel one-directionally (`Commands → Sol` allowed); `Sol` is a core module under `core-isolation`, and a back-edge would couple the SOL semantics to the operator shell (`swarm-cli` C-002 made concrete for this command, enforced by dependency-cruiser)
VERIFY BY static:cmdValidate:core-isolation

CONSTRAINT C-002:
THE command MUST NOT modify, reorder, or rewrite any `specs/*/spec.swarm.md`
BECAUSE checking is a read-only derivation; a gate that edits the specs it judges corrupts the single human-authored artifact (the same read-only rule as `sol-parser` C-001 and `sol-lint` C-001)
VERIFY BY test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#specs_unchanged_after_check

CONSTRAINT C-003:
THE command MUST NOT emit a repo `verdict` value outside the closed set (`clean`/`blocking`)
BECAUSE the verdict vocabulary is Swarm's (`reference/proofs.md`); inventing a repo-verdict value forks the language (the `swarm-cli` no-semantic-fork constraint, made concrete for this command)
VERIFY BY static:cmdTest:src/modules/Commands/__tests__/check.spec.ts#verdict_in_closed_set

## Invariants

INVARIANT I-001:
the repo `verdict` MUST be a pure function of the per-spec lint outcomes (`blocking` iff some spec is `blocking` or unparseable; else `clean`)
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/check.spec.ts#verdict_is_pure_over_spec_outcomes

INVARIANT I-002:
the report `exit_code` MUST agree with the report `verdict` (zero iff `clean`, non-zero iff `blocking`) for every run
VERIFY BY property:cmdTest:src/modules/Commands/__tests__/check.spec.ts#exit_code_agrees_with_verdict

## Questions

QUESTION Q-001 [non-blocking]:
The full proof-rerun model — re-running each obligation's bound `VERIFY BY` proofs, the 7-value verdict model (`PASS`/`FAIL`/`BLOCKED`/`UNVERIFIED` + `STALE`/`CONTRADICTED`/`WAIVED`), and the per-`RISK` adequacy gate (`SOL-V011`) — is the `verify`/`review` machinery. Does `check` v1 stay a parse-and-lint gate, or does a later version fold in the proof rerun (and if so, does it own the trace/verdict ledger or read one the `verify` step writes)?
AFFECTS AC-002

QUESTION Q-002 [non-blocking]:
Does `check` honor `imports:` between specs (a multi-spec IR so `SOL-M001` cross-spec collisions across the `imports` set are caught), or does it check each spec independently in v1? (`sol-lint` Q-002 raises the same multi-document-IR open question for the lint layer.)
AFFECTS AC-001

## Verification coverage

Proof **contracts** (the artifacts do not exist yet — every obligation is `UNVERIFIED` until `implement`
builds the proof). Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`,
`cmdValidate` = `pnpm deps:validate` = the dependency-cruiser import-graph check). A binding's *adapter* is
chosen for what can falsify it: `cmdValidate` for the `Commands → Sol` direction (an import-graph fact),
`cmdTest` for discovery/aggregation/exit-code (filesystem + process behaviour).

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Commands/__tests__/check.spec.ts#returns_report_over_repo           |
| IF-002 | contract:cmdTest:src/modules/Commands/__tests__/check.spec.ts#report_matches_schema              |
| AC-001 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#parses_and_lints_every_spec            |
| AC-002 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#repo_verdict_aggregates_per_spec       |
| AC-003 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#nonzero_iff_blocking                   |
| AC-004 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#unparseable_spec_blocks                |
| AC-005 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#empty_specs_set_is_not_clean           |
| AC-006 | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#diagnostics_attributed_to_spec         |
| C-001  | static:cmdValidate:core-isolation                                                                |
| C-002  | test:cmdTest:src/modules/Commands/__tests__/check.spec.ts#specs_unchanged_after_check            |
| C-003  | static:cmdTest:src/modules/Commands/__tests__/check.spec.ts#verdict_in_closed_set                |
| I-001  | property:cmdTest:src/modules/Commands/__tests__/check.spec.ts#verdict_is_pure_over_spec_outcomes  |
| I-002  | property:cmdTest:src/modules/Commands/__tests__/check.spec.ts#exit_code_agrees_with_verdict       |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The v1 contract: discover + parse + lint every `specs/*/spec.swarm.md`, aggregate to one repo verdict
  (`clean`/`blocking`), expose a CI-meaningful exit code (non-zero iff `blocking`), read-only, no semantic
  fork, `Commands → Sol` one-directional consumption.
- The two empty-set floors from the merge gate (ADR-0055): an unparseable spec blocks (AC-004) and a repo
  with no specs is not `clean` (AC-005) — a gate never passes by vacuity.

### Dropped

- The full proof-rerun + 7-value verdict + adequacy machinery — deliberately scoped out of v1 (Q-001); it is
  the `verify`/`review` step's, and folding it in is a later decision, not a v1 obligation.
- The exact `CheckReport` JSON schema (field types, the `SpecResult` shape) — bound to *match* the report
  shape (IF-002), not restated; the per-file lint verdict shape is `sol-lint` IF-002's.
- The per-layer lint detection and the IR shape — `sol-lint` and `sol-parser` own those; `check` consumes
  their outputs and aggregates across files.

### Still uncertain

- Whether `check` v1 ever re-runs bound proofs or stays parse-and-lint only, and where the trace/verdict
  ledger lives if it does (Q-001) — informed by ADR-0055's adequacy gating.
- Whether `check` resolves the `imports:` graph into a multi-spec IR (catching cross-spec `SOL-M001`
  collisions) or checks each spec independently in v1 (Q-002, shared with `sol-lint` Q-002).
