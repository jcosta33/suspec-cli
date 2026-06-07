# Structured form — operative reference (condensed)

The typed, machine-checkable form of a `*.swarm.md`. The surface is English-shaped UPPERCASE keywords;
the structured form is `snake_case` JSON. Full schema + worked instance: `docs/reference/structured-form.md` (upstream).

## Document shape
`{ meta, nodes[], edges[], diagnostics[], provenance }`.
- **meta**: `id`, `title`, `language`, `version`, `status`.
- **nodes[]**: one per obligation block. Key fields: `id` (namespaced `<KIND>.<spec>.<surface-id>`),
  `kind` (one of the 7 block types), `authority`, `modality` (the 5 modals or null), `clauses{}`
  (trigger/subject/predicate), `owner`, `risk`, **scope sets** `reads`/`writes`/`touches`,
  `verify_by[]`, `status` (core verdict), `lifecycle[]`, `source{file,line_start,line_end,content_hash}`,
  `provenance[]`.
- **edges[]**: `{ from, to, type, hard }`.
- **diagnostics[]**: the lint records.
- **provenance**: `{ hash, compiler_version, compiled_at }`.

## The 7 edge types (closed)
`depends_on` · `blocks` · `conflicts_with` · `verified_by` · `affects` · `implements` · `preserves`.

## The one hard rule: edges are the single source of relationship truth
A relationship between two nodes appears **exactly once, as an `edges[]` entry**, and **never** also as a
scalar field on a node (there is no `depends_on`/`affects`/… field on a node). Consumers read `edges[]`;
they MUST NOT reconstruct relationships from node fields. Scope sets (`reads`/`writes`/`touches`) are
intrinsic node data — distinct from edges; `lower` *derives* `conflicts_with`/`affects` edges *from* the
scope sets (e.g. two nodes sharing a write surface → a `conflicts_with` edge).

## Structuring contract (surface → structured form)
- `VERIFY BY` → `verify_by[]`; `WRITES`/`READS`/`TOUCHES` → the scope sets; `RISK`/`DOMAIN` → fields;
  `DEPENDS ON`/`AFFECTS` → `edges[]` (never node scalars).
- Each `THE …`/`AND THE …` consequence → a separate structured form obligation, same conditions + same `verify_by`.
- Every node carries its `source` span + `content_hash` (the basis for staleness/drift).
- Structuring is **lossless for binding content**: every obligation, modality, and binding in the source is
  recoverable from the structured form. Permitted drops (rationale, source digressions) are governed by the
  distillation-loss budget — see `pass-lower-spec` and the `distillation-discipline` skill.

## Plan (the `decompose` output, separate from the structured form)
`{ meta, packets[], edges[] }`. A packet: `{ id, inputs, writes, reads, depends_on, lane, batch,
merge_safe }`. **Safe-parallelism predicate:** two packets MAY run in parallel **iff** dependency-
independent (neither reachable from the other along `depends_on`) **AND** write-disjoint (no shared
`writes` surface, no read/write conflict, no shared interface/migration node). Unscoped or shared →
serialize. Packet `writes` ⊆ its obligations' declared `WRITES` (else `SOL-O005`).
