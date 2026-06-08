// The typed obligation IR — the machine-checkable form of a *.swarm.md spec.
// Shapes follow the Swarm IR reference (.agents/reference/ir.md): meta, nodes[], edges[], diagnostics[],
// provenance. snake_case fields are deliberate: they match the IR schema the rest of the pipeline reads.

export const BLOCK_KINDS = ['REQ', 'CONSTRAINT', 'INVARIANT', 'INTERFACE', 'QUESTION', 'TRACE', 'VERDICT'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const EDGE_TYPES = [
    'depends_on',
    'blocks',
    'conflicts_with',
    'verified_by',
    'affects',
    'implements',
    'preserves',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const LINT_LAYERS = ['S', 'P', 'M', 'V', 'O'] as const;
export type LintLayer = (typeof LINT_LAYERS)[number];

// The origin of a node in the source spec. `content_hash` is the staleness key the drift model joins against.
export type SourceSpan = Readonly<{
    file: string;
    line_start: number;
    line_end: number;
    content_hash: string;
}>;

// The lowered surface-keyword clauses on a block (AC-002), snake_case to match the IR schema.
// Relationships (`DEPENDS ON` / `AFFECTS`) are deliberately NOT here — they live only in `edges[]` (I-001).
export type ObligationClauses = Readonly<{
    verify_by: readonly string[];
    writes: readonly string[];
    reads: readonly string[];
    risk: string | null;
}>;

// One IR node per SOL block (AC-001), source-mapped (AC-004), carrying its lowered clauses (AC-002).
export type IrNode = Readonly<{
    id: string;
    kind: BlockKind;
    source: SourceSpan;
    clauses: ObligationClauses;
}>;

// A relationship between two nodes — the sole home of relationships (AC-003 / I-001).
export type IrEdge = Readonly<{
    from: string;
    to: string;
    type: EdgeType;
    hard: boolean;
}>;

// A lint record (later increment, AC-005). Shaped per the IR reference; emitted by the parser at parse time
// and by the linter over the assembled IR.
export type Diagnostic = Readonly<{
    code: string;
    severity: 'BLOCKING' | 'ADVISORY';
    layer: LintLayer;
    span: SourceSpan;
    message: string;
    suggest: string | null;
}>;

export type IrMeta = Readonly<{
    id: string;
    language: string;
    spec_version: string;
}>;

// Provenance hashes are tool-emitted (the parser computes them); emitted_at is left null until a clock is
// injected, keeping a parse deterministic.
export type IrProvenance = Readonly<{
    hash: string;
    tool_version: string;
    emitted_at: string | null;
}>;

export type SwarmIr = Readonly<{
    meta: IrMeta;
    nodes: readonly IrNode[];
    edges: readonly IrEdge[];
    diagnostics: readonly Diagnostic[];
    provenance: IrProvenance;
}>;
