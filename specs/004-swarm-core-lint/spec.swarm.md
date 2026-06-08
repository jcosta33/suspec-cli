---
type: spec
id: swarm-core-lint
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm-core lint — the five-layer SOL linter over the IR
owners: []
imports: [swarm-core-parser]
domain: architecture
created: 2026-06-08
updated: 2026-06-08
---

# Spec: swarm-core lint — the five-layer SOL linter

## Intent

`swarm-core`'s linter runs the **five SOL lint layers** — `S` syntax, `P` prose, `M` semantic/cross-reference,
`V` verification, `O` orchestration/ownership — over the typed obligation IR produced by `swarm-core-parser`,
and emits the complete diagnostic set plus a single report verdict (`clean` / `advisory` / `blocking`). It is
the engine behind `swarm lint`. It is **read-only**: it reports defects, it never repairs them — repair is the
`improve`/`format` step's job. It exists so the catch-it-before-generation discipline the framework defines
(a spec defect is cheapest to fix before any code is generated from it) becomes a command an adopter can run in
an editor or in CI.

The split with the parser is deliberate: the **parser** emits the structural diagnostics it must produce just
to build the IR (a block it cannot parse). The **linter** runs the full five-layer analysis over the assembled
IR — the cross-cutting layers (`M` cross-reference, `V` binding completeness, `O` write-surface ownership) and
the heuristic prose layer (`P`) that need the whole document, not one block.

## Non-goals

- Not parsing — the IR and its parse-time diagnostics are `swarm-core-parser` (IF-002, AC-005). This spec
  consumes that IR.
- Not repairing a spec — the linter reports; `improve` (`NORMALIZE`/`CONCRETIZE`/…) and `format` repair. The
  linter only maps each diagnostic to a *suggested* improve operation.
- Not proof **adequacy** judging (`SOL-V011`) — that needs a recorded trace/verdict and is a `verify`/`review`
  concern (`swarm-core-verify`). The `V` layer here checks the spec's verification *bindings*, not run proofs.
- Not defining the SOL grammar, the lint code catalogue, or the five-layer taxonomy — those are the Swarm
  language reference's; this spec contracts the linter that realizes them.

## Context

`swarm-core`'s `packages/core`, layered directly on the parser (`imports: swarm-core-parser`). The five lint
layers, their closed `SOL-<LAYER>NNN` code catalogue, the per-code BLOCKING/ADVISORY severity, and the
code→improve-operation routing are fixed by the Swarm language reference (`docs/language/errors.md`,
`docs/passes/lint.md`) and the shipped `reference/sol.md` card; this spec binds the linter to *apply* them.

## Interfaces

INTERFACE IF-001:
`lint` RETURNS `LintReport | LintFailure`
ACCEPTS:
  - `ir: SwarmIR` (the typed obligation IR from `swarm-core-parser`)
  - `options: { strict?: boolean }`
ERRORS:
  - ir-schema-invalid
OWNED BY swarm-core
VERIFY BY contract:cmdTest:packages/core/test/lint/lint.contract.spec.ts#returns_report_over_ir

INTERFACE IF-002:
`LintReport` RETURNS `{ diagnostics: Diagnostic[], summary: { by_layer, by_severity }, verdict }`
ACCEPTS:
  - `verdict: clean | advisory | blocking`
OWNED BY swarm-core
VERIFY BY contract:cmdTest:packages/core/test/lint/report-schema.contract.spec.ts#report_matches_schema

## Obligations

REQ AC-001:
WHEN the linter runs over an IR
THE linter MUST evaluate all five lint layers — `S` (syntax), `P` (prose), `M` (semantic/cross-reference), `V` (verification), `O` (orchestration/ownership)
VERIFY BY test:cmdTest:packages/core/test/lint/layers.spec.ts#all_five_layers_run
DEPENDS ON IF-001
RISK high

REQ AC-002:
THE linter MUST classify each diagnostic's severity as `BLOCKING` or `ADVISORY` per the code catalogue
AND THE linter MUST set the report `verdict` to `blocking` when any `BLOCKING` diagnostic fired, else `advisory` when any diagnostic fired, else `clean`
VERIFY BY test:cmdTest:packages/core/test/lint/verdict.spec.ts#verdict_aggregates_severities
DEPENDS ON IF-002
RISK high

REQ AC-003:
WHEN the linter evaluates the deterministic layers (`S`, `M`, `V`, `O`)
THE linter MUST produce the same diagnostics for the same IR on every run
BECAUSE a non-reproducible blocking gate cannot anchor CI or a merge decision
VERIFY BY property:cmdTest:packages/core/test/lint/determinism.property.spec.ts#same_ir_same_deterministic_diagnostics
DEPENDS ON AC-001
RISK high

REQ AC-004:
WHEN a `SOL-P` prose diagnostic is produced by a heuristic detector (an LLM judge or a fuzzy matcher rather than a deterministic pattern)
THE linter MUST mark that diagnostic as heuristic
AND THE linter MUST NOT raise it as `BLOCKING`
BECAUSE lightweight requirement-smell detection tops out around ~0.59 precision / ~0.82 recall (the Swarm prose-corpus baseline; Femmer et al. requirement smells) — asserting a fuzzy flag as a hard gate manufactures false confidence and trains adopters to ignore the linter
VERIFY BY test:cmdTest:packages/core/test/lint/heuristic-prose.spec.ts#heuristic_p_is_advisory_and_marked
DEPENDS ON AC-002
RISK high

REQ AC-005:
THE linter SHOULD attach to each diagnostic the improve operation that resolves it (the code→operation routing — e.g. `SOL-M001`→`CONCRETIZE`, an untyped binding→`NORMALIZE`)
BECAUSE the diagnostic is only half the value; the routing is what lets `improve` act on it without re-deriving intent
VERIFY BY test:cmdTest:packages/core/test/lint/suggest-routing.spec.ts#diagnostics_carry_improve_op
DEPENDS ON AC-001
RISK low

REQ AC-006:
WHEN `swarm lint` is invoked as a process
THE linter's exit code MUST be non-zero if and only if the report `verdict` is `blocking`
BECAUSE an advisory-only report must not fail CI, and a blocking report must
VERIFY BY test:cmdTest:packages/cli/test/lint/exit-code.spec.ts#nonzero_iff_blocking
DEPENDS ON AC-002
RISK medium

REQ AC-007:
WHEN `options.strict` is set
THE linter MUST raise the advisory-demotable codes (e.g. `SOL-V003` INVARIANT bound only to a non-observable test) as `BLOCKING`
VERIFY BY test:cmdTest:packages/core/test/lint/strict-mode.spec.ts#strict_promotes_demotable_to_blocking
DEPENDS ON AC-002
RISK medium

REQ AC-008:
WHEN the linter reads an artifact carrying zero-width, bidirectional-control, or other non-printing control characters (outside `\t`/`\n`), or homoglyph-suspect mixed-script identifiers
THE linter MUST emit the HARD lexical-safety diagnostic `SOL-S013` as `BLOCKING`
BECAUSE agent-read markdown is a prompt-injection surface; this class of hidden instruction reached remote code execution in a shipped agent, so the check is a security floor, not a style nicety
VERIFY BY test:cmdTest:packages/core/test/lint/lexical-safety.spec.ts#hidden_chars_block
DEPENDS ON AC-001
RISK critical

## Constraints

CONSTRAINT C-001:
THE linter MUST NOT modify, reorder, or rewrite the source `*.swarm.md` or the IR
BECAUSE linting is a read-only derivation; a linter that edits is doing `improve`'s job and corrupts the single human-authored artifact
VERIFY BY test:cmdTest:packages/core/test/lint/readonly.spec.ts#source_and_ir_unchanged_after_lint

CONSTRAINT C-002:
THE linter MUST NOT emit a diagnostic `code`, `layer`, or `severity` outside the closed sets (the five layers `S`/`P`/`M`/`V`/`O` and the `SOL-<LAYER>NNN` catalogue)
BECAUSE the closed sets are Swarm's; inventing a code forks the language (the `swarm-cli` no-semantic-fork constraint, made concrete for the lint layer)
VERIFY BY static:cmdTest:packages/core/test/conformance/lint-codes-closed.spec.ts#emitted_codes_in_catalogue

CONSTRAINT C-003:
THE linter MUST NOT report a heuristic finding with the same status signal as a deterministic one
BECAUSE collapsing "a rule definitely fired" and "a judge guessed" into one undifferentiated blocking signal is the false-confidence failure AC-004 guards against, viewed from the report shape
VERIFY BY test:cmdTest:packages/core/test/lint/report-schema.contract.spec.ts#heuristic_flag_present_on_p

## Invariants

INVARIANT I-001:
every diagnostic's `layer` MUST match the layer its `code` belongs to in the catalogue (`SOL-S*`→`S`, `SOL-P*`→`P`, `SOL-M*`→`M`, `SOL-V*`→`V`, `SOL-O*`→`O`)
VERIFY BY property:cmdTest:packages/core/test/lint/layer-code-agreement.property.spec.ts#code_layer_consistent

INVARIANT I-002:
the report `verdict` MUST be a pure function of its diagnostics' severities (`blocking` iff some `BLOCKING` fired; else `advisory` iff any fired; else `clean`)
VERIFY BY property:cmdTest:packages/core/test/lint/verdict.property.spec.ts#verdict_is_pure_over_severities

## Questions

QUESTION Q-001 [non-blocking]:
Is the heuristic `SOL-P` detector an LLM judge, a deterministic pattern set, or both behind a flag — and where is its precision/recall measured (the prose-corpus fixture) so the advisory-grade claim stays honest?
AFFECTS AC-004

QUESTION Q-002 [non-blocking]:
Does the linter own the cross-spec layer (`SOL-M001` collision across the `imports` set), or does that need a multi-spec IR the parser does not yet assemble for a single document?
AFFECTS AC-001

## Verification coverage

Proof **contracts** (the artifacts do not exist yet — every obligation is `UNVERIFIED` until `implement`
builds the proof). Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`).

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:packages/core/test/lint/lint.contract.spec.ts#returns_report_over_ir            |
| IF-002 | contract:cmdTest:packages/core/test/lint/report-schema.contract.spec.ts#report_matches_schema    |
| AC-001 | test:cmdTest:packages/core/test/lint/layers.spec.ts#all_five_layers_run                          |
| AC-002 | test:cmdTest:packages/core/test/lint/verdict.spec.ts#verdict_aggregates_severities               |
| AC-003 | property:cmdTest:packages/core/test/lint/determinism.property.spec.ts#same_ir_same_deterministic_diagnostics |
| AC-004 | test:cmdTest:packages/core/test/lint/heuristic-prose.spec.ts#heuristic_p_is_advisory_and_marked  |
| AC-005 | test:cmdTest:packages/core/test/lint/suggest-routing.spec.ts#diagnostics_carry_improve_op        |
| AC-006 | test:cmdTest:packages/cli/test/lint/exit-code.spec.ts#nonzero_iff_blocking                       |
| AC-007 | test:cmdTest:packages/core/test/lint/strict-mode.spec.ts#strict_promotes_demotable_to_blocking   |
| AC-008 | test:cmdTest:packages/core/test/lint/lexical-safety.spec.ts#hidden_chars_block                   |
| C-001  | test:cmdTest:packages/core/test/lint/readonly.spec.ts#source_and_ir_unchanged_after_lint         |
| C-002  | static:cmdTest:packages/core/test/conformance/lint-codes-closed.spec.ts#emitted_codes_in_catalogue |
| C-003  | test:cmdTest:packages/core/test/lint/report-schema.contract.spec.ts#heuristic_flag_present_on_p   |
| I-001  | property:cmdTest:packages/core/test/lint/layer-code-agreement.property.spec.ts#code_layer_consistent |
| I-002  | property:cmdTest:packages/core/test/lint/verdict.property.spec.ts#verdict_is_pure_over_severities |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The five-layer lint over the IR, the BLOCKING/ADVISORY severity model and the pure verdict aggregation,
  read-only, no semantic fork, the code→improve-op routing, CI-meaningful exit codes, and the `SOL-S013`
  lexical-safety floor.
- The **honesty boundary** the prose layer demands: a heuristic `SOL-P` flag is advisory and marked as such
  (AC-004/C-003), because the field-measured precision/recall ceiling for prose-smell detection forbids
  treating it as a hard gate.

### Dropped

- The exact `SOL-<LAYER>NNN` catalogue (every code, its message, its severity, its improve-op) — it is the
  Swarm language reference's; this spec binds the linter to *apply* it (C-002 + the closed-codes proof), not
  restate it.
- Per-layer detection algorithms (how `SOL-P008` hedged-ambiguity is judged, how `SOL-M001` resolves a
  referent) — implementation detail for the `implement` step, not obligations here.

### Still uncertain

- Whether the cross-spec `SOL-M001` collision check needs a multi-document IR the parser does not yet build
  (Q-002) — it may force a small `swarm-core-parser` extension or a separate workspace-level lint pass.
- Whether the heuristic `SOL-P` detector ships at all in v1, or the prose layer is deterministic-only until a
  measured judge exists (Q-001).
