---
type: spec
id: swarm-core-parser
swarm_language: SOL/0.1
aps_version: 0.1
spec_version: 0.1.0
status: draft
title: swarm-core parser — SOL surface to typed obligation IR
owners: []
imports: []
domain: architecture
created: 2026-06-06
updated: 2026-06-06
---

# Spec: swarm-core parser — SOL surface to typed obligation IR

## Intent

`swarm-core`'s parser reads a human-authored `*.swarm.md` (controlled markdown carrying SOL blocks) and
produces the **typed obligation IR** — the machine-checkable form of that same content — together with a
list of lint diagnostics. It is **read-only**: it derives the IR, never edits the source. The IR it emits
is the object every later pass reasons over (`lint` reports on it, `lower`/`decompose` plan from it,
`verify`/`review` judge against it), so this spec fixes what a conformant parse MUST yield. It is the
first tool that actually exercises the Swarm IR schema, so it is also the spec under which the schema's
real defects surface and feed back upstream.

## Non-goals

- Not verification, lowering-to-task-frames, worktree allocation, or the merge gate — those are
  `swarm-core-verify`, `swarm-core-pipeline`, `swarm-core-worktree`.
- Not workspace resolution (where the spec file comes from) — that is the `swarm-core` workspace
  concern `swarm-cli` AC-001 delegates to.
- Not authoring or repairing a spec — a human authors; `write-spec`/`improve` repair. The parser only
  *reads* and *reports*.

## Context

`swarm-core`'s `packages/core`. The SOL surface grammar (the 7 block types, 5 modals, EARS conditions,
metadata clauses, `VERIFY BY` form, the id convention) and the IR document shape (nodes / edges /
diagnostics / provenance, snake_case fields) are fixed by the Swarm language reference and IR schema in
the `swarm` repo; this spec contracts the parser that realizes them, it does not redefine them.

## Interfaces

INTERFACE IF-001:
`parseSpec` RETURNS `SwarmIR | ParseFailure`
ACCEPTS:
  - `source: string` (one `*.swarm.md` document)
  - `path: string` (for source-mapping)
ERRORS:
  - unparseable-frontmatter
  - unknown-block-type
OWNED BY swarm-core
VERIFY BY contract:cmdTest:packages/core/test/parser/parse-spec.contract.spec.ts#parses_seven_block_types

INTERFACE IF-002:
`SwarmIR` RETURNS `{ meta, nodes[], edges[], diagnostics[], provenance }`
ERRORS:
  - schema-invalid
OWNED BY swarm-core
VERIFY BY contract:cmdTest:packages/core/test/parser/ir-schema.contract.spec.ts#ir_matches_schema

## Obligations

REQ AC-001:
WHEN the parser reads a `*.swarm.md` source
THE parser MUST emit one typed IR node per SOL block, each carrying a `kind` drawn from the seven closed block types (`REQ`, `CONSTRAINT`, `INVARIANT`, `INTERFACE`, `QUESTION`, `TRACE`, `VERDICT`)
VERIFY BY test:cmdTest:packages/core/test/parser/nodes.spec.ts#one_node_per_block_typed
DEPENDS ON IF-001
RISK high

REQ AC-002:
THE parser MUST lower each surface keyword clause to its `snake_case` IR field (`VERIFY BY` → `verify_by`, `WRITES` → `writes`, `READS` → `reads`, `RISK` → `risk`)
VERIFY BY test:cmdTest:packages/core/test/parser/lowering.spec.ts#keywords_to_snake_case
DEPENDS ON AC-001
RISK medium

REQ AC-003:
THE parser MUST represent every relationship (`DEPENDS ON`, `AFFECTS`, and the derived `conflicts_with`/`verified_by`/`implements`/`preserves`/`blocks`) as an entry in `edges[]`, drawn from the seven closed edge types
VERIFY BY test:cmdTest:packages/core/test/parser/edges.spec.ts#relationships_are_edges
DEPENDS ON AC-001
RISK high

REQ AC-004:
THE parser MUST source-map every node with its origin span and content hash (`source.file`, `source.line_start`, `source.line_end`, `source.content_hash`)
VERIFY BY test:cmdTest:packages/core/test/parser/source-map.spec.ts#every_node_source_mapped
DEPENDS ON AC-001
RISK high

REQ AC-005:
WHEN a block is ill-formed (a condition with no actor clause, an actor clause with no modal, an id prefix not matching its block type, a `SHOULD` with no `BECAUSE`/`EXCEPT`, a missing/out-of-order required section)
THE parser MUST emit the corresponding `SOL-S`/`SOL-P`/`SOL-M` diagnostic record `{ code, severity, layer, span, message, suggest }` rather than discard or silently repair the block
VERIFY BY test:cmdTest:packages/core/test/parser/diagnostics.spec.ts#illformed_blocks_emit_codes
DEPENDS ON IF-002
RISK high

REQ AC-006:
WHEN a `REQ` chains consequences with `AND THE`
THE parser MUST lower each `THE …`/`AND THE …` consequence to a separate IR obligation, each carrying the same conditions and the same `verify_by`
VERIFY BY test:cmdTest:packages/core/test/parser/and-the.spec.ts#chained_consequences_split
DEPENDS ON AC-001
RISK medium

## Constraints

CONSTRAINT C-001:
THE parser MUST NOT modify, reorder, or rewrite the source `*.swarm.md`
BECAUSE parsing is a read-only derivation; a parser that edits the source is doing the `improve` pass's job and corrupts the single human-authored artifact
VERIFY BY test:cmdTest:packages/core/test/parser/readonly.spec.ts#source_byte_identical_after_parse

CONSTRAINT C-002:
THE parser MUST NOT emit a block `kind`, lint `code`, edge `type`, or modal outside Swarm's closed sets
BECAUSE the closed sets are Swarm's (the language reference); inventing a value forks the language (the `swarm-cli` no-semantic-fork constraint, made concrete here)
VERIFY BY static:cmdTest:packages/core/test/conformance/closed-sets.spec.ts#emitted_values_in_closed_sets

CONSTRAINT C-003:
WHEN the modal of a consequence is ambiguous (a modal word appears that is not at the actor/response boundary)
THE parser MUST NOT guess the split
BECAUSE the modal-scan rule is longest-match at a token boundary; a guessed actor/response boundary silently changes the obligation's meaning — the author must quote/reword instead
VERIFY BY test:cmdTest:packages/core/test/parser/modal-scan.spec.ts#ambiguous_modal_is_a_diagnostic_not_a_guess

## Invariants

INVARIANT I-001:
a relationship between two nodes MUST appear exactly once, as an `edges[]` entry, and never also as a scalar field on a node
VERIFY BY property:cmdTest:packages/core/test/parser/edges.property.spec.ts#no_relationship_as_node_scalar

INVARIANT I-002:
every obligation, modality, and `VERIFY BY` binding present in the source MUST be recoverable from the IR (the lowering is lossless for binding content)
VERIFY BY property:cmdTest:packages/core/test/parser/lossless.property.spec.ts#source_obligations_recoverable_from_ir

## Questions

QUESTION Q-001 [non-blocking]:
Is `content_hash` computed over the block's raw source span, its normalized text, or its lowered IR node — and which definition keeps it stable across cosmetic edits while still tripping on a semantic change?
AFFECTS AC-004

QUESTION Q-002 [non-blocking]:
When the source is edited, are `line_start`/`line_end` recomputed by re-parse only, or does the parser expose an incremental re-map?
AFFECTS AC-004

## Verification coverage

Proof **contracts** (the artifacts do not exist yet — every obligation is `UNVERIFIED` until `implement`
builds the proof). Adapters resolve through `AGENTS.md > Commands` (`cmdTest` = `pnpm test:run`).

| ID     | VERIFY BY                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------- |
| IF-001 | contract:cmdTest:packages/core/test/parser/parse-spec.contract.spec.ts#parses_seven_block_types  |
| IF-002 | contract:cmdTest:packages/core/test/parser/ir-schema.contract.spec.ts#ir_matches_schema          |
| AC-001 | test:cmdTest:packages/core/test/parser/nodes.spec.ts#one_node_per_block_typed                    |
| AC-002 | test:cmdTest:packages/core/test/parser/lowering.spec.ts#keywords_to_snake_case                   |
| AC-003 | test:cmdTest:packages/core/test/parser/edges.spec.ts#relationships_are_edges                     |
| AC-004 | test:cmdTest:packages/core/test/parser/source-map.spec.ts#every_node_source_mapped               |
| AC-005 | test:cmdTest:packages/core/test/parser/diagnostics.spec.ts#illformed_blocks_emit_codes           |
| AC-006 | test:cmdTest:packages/core/test/parser/and-the.spec.ts#chained_consequences_split                |
| C-001  | test:cmdTest:packages/core/test/parser/readonly.spec.ts#source_byte_identical_after_parse        |
| C-002  | static:cmdTest:packages/core/test/conformance/closed-sets.spec.ts#emitted_values_in_closed_sets   |
| C-003  | test:cmdTest:packages/core/test/parser/modal-scan.spec.ts#ambiguous_modal_is_a_diagnostic_not_a_guess |
| I-001  | property:cmdTest:packages/core/test/parser/edges.property.spec.ts#no_relationship_as_node_scalar  |
| I-002  | property:cmdTest:packages/core/test/parser/lossless.property.spec.ts#source_obligations_recoverable_from_ir |

## Downstream tasks

| Task | Covers |
| ---- | ------ |
| _(assigned by the `decompose` pass)_ | |

## Distillation loss statement

### Preserved

- The parse contract: typed nodes over the 7 closed block types, snake_case lowering, edges-as-sole-
  relationship-source, source-mapping, diagnostic emission, AND-THE splitting, read-only, no semantic fork.
- `swarm-cli` C-002 (no semantic fork) made concrete and testable here (C-002 + the closed-sets proof) —
  resolving spec #1's "still uncertain" note that C-002 was only testable once the parser exists.

### Dropped

- The exact IR JSON schema (field types, required/optional) — it is the Swarm IR reference's; this spec
  binds the parser to *match* it (IF-002) rather than restating it.
- Lowering of the orchestration metadata into the *plan* (work packets, the safe-parallelism predicate)
  — that is `swarm-core-pipeline` (the `decompose` side), not the parser.

### Still uncertain

- Whether the parser also computes the *derived* edges (`conflicts_with`/`affects` from shared write
  surfaces) or whether that derivation belongs to a later `lower` stage (AC-003 currently assumes the
  parser emits them; the boundary with `lower` needs pinning).
- `content_hash` definition (Q-001) and incremental re-mapping (Q-002).
