---
type: spec
id: sol-parser
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.2.0
status: draft
title: SOL parser — surface to typed obligation IR (src/modules/Sol)
owners: []
imports: []
domain: architecture
created: 2026-06-06
updated: 2026-06-08
---

# Spec: SOL parser — surface to typed obligation IR

## Intent

The **`Sol` module's** parser (`src/modules/Sol`) reads a human-authored `*.swarm.md` (controlled markdown
carrying SOL blocks) and produces the **typed obligation IR** — the machine-checkable form of that same
content — together with a list of lint diagnostics. It is **read-only**: it derives the IR, never edits the
source. The IR it emits is the object every later step reasons over (`lint` reports on it, `lower`/`decompose`
plan from it, `verify`/`review` judge against it), so this spec fixes what a conformant parse MUST yield. It
is the first tool that exercises the Swarm IR schema, so it is also the spec under which the schema's real
defects surface and feed back upstream.

## Non-goals

- Not verification, lowering-to-task-frames, worktree allocation, or the merge gate — separate concerns.
- Not workspace resolution (where the spec file comes from) — that is a `Commands`/operator concern.
- Not authoring or repairing a spec — a human authors; `write-spec`/`improve` repair. The parser only
  *reads* and *reports*.

## Context

A **core module** at `src/modules/Sol` (ADR-0001: one tool, no monorepo — the SOL semantics are `src/modules`,
not a package). Per `core-isolation` it cannot depend on `Commands`/`Terminal`. The SOL surface grammar (the
7 block types, 5 modals, EARS conditions, metadata clauses, `VERIFY BY` form, the id convention) and the IR
document shape (nodes / edges / diagnostics / provenance, snake_case fields) are fixed by the Swarm language
reference and IR schema (`.agents/reference/`); this spec contracts the parser that realizes them, it does not
redefine them. Errors use the repo's `Result` + `AppError` (`src/infra/errors`).

## Interfaces

INTERFACE IF-001:
`parse_spec` RETURNS `Result<SwarmIr, ParseFailure>`
ACCEPTS:
  - `source: string` (one `*.swarm.md` document)
  - `path: string` (for source-mapping)
ERRORS:
  - ParseFailure(reason=unparseable-frontmatter)
  - ParseFailure(reason=unknown-block-type)
OWNED BY Sol
VERIFY BY contract:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#parses_seven_block_types

INTERFACE IF-002:
`SwarmIr` RETURNS `{ meta, nodes[], edges[], diagnostics[], provenance }`
ERRORS:
  - schema-invalid
OWNED BY Sol
VERIFY BY contract:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#ir_matches_schema

## Obligations

REQ AC-001:
WHEN the parser reads a `*.swarm.md` source
THE parser MUST emit one typed IR node per SOL block, each carrying a `kind` drawn from the seven closed block types (`REQ`, `CONSTRAINT`, `INVARIANT`, `INTERFACE`, `QUESTION`, `TRACE`, `VERDICT`)
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#one_node_per_block_typed
DEPENDS ON IF-001
RISK high

REQ AC-002:
THE parser MUST lower each surface keyword clause to its `snake_case` IR field (`VERIFY BY` → `verify_by`, `WRITES` → `writes`, `READS` → `reads`, `RISK` → `risk`)
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#keywords_to_snake_case
DEPENDS ON AC-001
RISK medium

REQ AC-003:
THE parser MUST represent every relationship (`DEPENDS ON`, `AFFECTS`, and the derived `conflicts_with`/`verified_by`/`implements`/`preserves`/`blocks`) as an entry in `edges[]`, drawn from the seven closed edge types
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#relationships_are_edges
DEPENDS ON AC-001
RISK high

REQ AC-004:
THE parser MUST source-map every node with its origin span and content hash (`source.file`, `source.line_start`, `source.line_end`, `source.content_hash`)
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#every_node_source_mapped
DEPENDS ON AC-001
RISK high

REQ AC-005:
WHEN a block is ill-formed (a condition with no actor clause, an actor clause with no modal, an id prefix not matching its block type, a `SHOULD` with no `BECAUSE`/`EXCEPT`, a missing/out-of-order required section)
THE parser MUST emit the corresponding `SOL-S`/`SOL-P`/`SOL-M` diagnostic record `{ code, severity, layer, span, message, suggest }` rather than discard or silently repair the block
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#illformed_blocks_emit_codes
DEPENDS ON IF-002
RISK high

REQ AC-006:
WHEN a `REQ` chains consequences with `AND THE`
THE parser MUST lower each `THE …`/`AND THE …` consequence to a separate IR obligation, each carrying the same conditions and the same `verify_by`
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#chained_consequences_split
DEPENDS ON AC-001
RISK medium

## Constraints

CONSTRAINT C-001:
THE parser MUST NOT modify, reorder, or rewrite the source `*.swarm.md`
BECAUSE parsing is a read-only derivation; a parser that edits the source is doing the `improve` step's job and corrupts the single human-authored artifact
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#source_byte_identical_after_parse

CONSTRAINT C-002:
THE parser MUST NOT emit a block `kind`, lint `code`, edge `type`, or modal outside Swarm's closed sets
BECAUSE the closed sets are Swarm's (the language reference); inventing a value forks the language (the `swarm-cli` no-semantic-fork constraint, made concrete here)
VERIFY BY static:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#emitted_values_in_closed_sets

CONSTRAINT C-003:
WHEN the modal of a consequence is ambiguous (a modal word appears that is not at the actor/response boundary)
THE parser MUST NOT guess the split
BECAUSE the modal-scan rule is longest-match at a token boundary; a guessed actor/response boundary silently changes the obligation's meaning — the author must quote/reword instead
VERIFY BY test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#ambiguous_modal_is_a_diagnostic_not_a_guess

## Invariants

INVARIANT I-001:
a relationship between two nodes MUST appear exactly once, as an `edges[]` entry, and never also as a scalar field on a node
VERIFY BY property:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#no_relationship_as_node_scalar

INVARIANT I-002:
every obligation, modality, and `VERIFY BY` binding present in the source MUST be recoverable from the IR (the lowering is lossless for binding content)
VERIFY BY property:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#source_obligations_recoverable_from_ir

## Questions

QUESTION Q-001 [non-blocking]:
Is `content_hash` computed over the block's raw source span, its normalized text, or its lowered IR node — and which definition keeps it stable across cosmetic edits while still tripping on a semantic change? (Increments 1-2 chose the raw source span.)
AFFECTS AC-004

QUESTION Q-002 [non-blocking]:
When the source is edited, are `line_start`/`line_end` recomputed by re-parse only, or does the parser expose an incremental re-map?
AFFECTS AC-004

## Verification coverage

Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`). **Implemented + passing**
(increments 1-3, `src/modules/Sol`): IF-001, IF-002, AC-001, AC-002, AC-003, AC-004, AC-005 (block-level —
`SOL-S001`/`S003`/`S005`/`S006`), C-001, C-002, C-003, I-001, I-002.
**Pending**: AC-006 (the `AND THE` consequence split) and AC-005's **section-level** case (`SOL-S012`,
missing/out-of-order section) — increment 4.

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#parses_seven_block_types            |
| IF-002 | contract:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#ir_matches_schema                   |
| AC-001 | test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#one_node_per_block_typed                |
| AC-002 | test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#keywords_to_snake_case                  |
| AC-003 | test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#relationships_are_edges                 |
| AC-004 | test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#every_node_source_mapped                |
| AC-005 | test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#illformed_blocks_emit_codes           |
| AC-006 | test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#chained_consequences_split            |
| C-001  | test:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#source_byte_identical_after_parse       |
| C-002  | static:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#emitted_values_in_closed_sets         |
| C-003  | test:cmdTest:src/modules/Sol/__tests__/diagnostics.spec.ts#ambiguous_modal_is_a_diagnostic_not_a_guess |
| I-001  | property:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#no_relationship_as_node_scalar      |
| I-002  | property:cmdTest:src/modules/Sol/__tests__/parseSpec.spec.ts#source_obligations_recoverable_from_ir |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| increment 1 (merged) — parser core | IF-001, IF-002, AC-001, AC-004, C-001 |
| increment 2 (merged) — clauses + edges | AC-002, AC-003, I-001, I-002, C-002 |
| increment 3 (merged) — block diagnostics | AC-005 (block-level), C-003 |
| increment 4 (pending) — AND-THE + sections | AC-006, AC-005 `SOL-S012` |

## Distillation loss statement

### Preserved

- The parse contract: typed nodes over the 7 closed block types, snake_case lowering, edges-as-sole-
  relationship-source, source-mapping, diagnostic emission, AND-THE splitting, read-only, no semantic fork.
- `swarm-cli` C-002 (no semantic fork) made concrete and testable here (C-002 + the closed-sets proof).

### Dropped

- The exact IR JSON schema (field types, required/optional) — it is the Swarm IR reference's; this spec
  binds the parser to *match* it (IF-002) rather than restating it.
- The pnpm-monorepo `packages/core` home (spec_version 0.1.0) — retired by [ADR-0001](../../decisions/0001-single-tool-no-monorepo.md);
  the parser is the `src/modules/Sol` core module, governed by dependency-cruiser `core-isolation`.

### Still uncertain

- Whether the parser also computes the *derived* edges (`conflicts_with`/`affects` from shared write
  surfaces) or whether that derivation belongs to a later `lower` stage (AC-003 currently emits only the
  explicit `DEPENDS ON`/`AFFECTS`; the derived set + the boundary with `lower` needs pinning).
- `content_hash` definition (Q-001) and incremental re-mapping (Q-002).
