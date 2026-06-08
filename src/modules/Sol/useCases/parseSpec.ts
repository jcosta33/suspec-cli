import { type Result, ok, isErr } from '../../../infra/errors/result.ts';
import type { SwarmIr } from '../models/ir.ts';
import type { ParseFailure } from '../models/parseFailure.ts';
import { split_frontmatter, parse_meta } from '../services/frontmatter.ts';
import { scan_blocks } from '../services/scanBlocks.ts';
import { build_nodes_and_edges } from '../services/buildIr.ts';
import { sha256 } from '../services/digest.ts';

const TOOL_VERSION = 'swarm-sol-parser/0.1.0';

export type ParseSpecInput = Readonly<{
    source: string;
    path: string;
}>;

export type ParseSpecResult = Result<SwarmIr, ParseFailure>;

/**
 * IF-001: read one `*.swarm.md` source and derive the typed obligation IR (or a `ParseFailure`).
 * Read-only (C-001): the input string is never mutated; the function holds no state between calls.
 * Increment 1+2 emit typed, source-mapped nodes with lowered clauses (AC-001/002/004) and relationships as
 * edges[] (AC-003); `diagnostics[]` is empty until the diagnostic increment (AC-005), kept (not omitted) so
 * the IR shape stays stable (IF-002).
 */
export function parse_spec(input: ParseSpecInput): ParseSpecResult {
    const split = split_frontmatter(input.source);
    if (isErr(split)) {
        return split;
    }
    const meta = parse_meta({
        lines: split.value.lines,
        frontmatter_end_line: split.value.frontmatter_end_line,
    });
    if (isErr(meta)) {
        return meta;
    }
    const blocks = scan_blocks({
        lines: split.value.lines,
        first_body_index: split.value.frontmatter_end_line,
        file: input.path,
    });
    const built = build_nodes_and_edges(blocks);
    return ok({
        meta: meta.value,
        nodes: built.nodes,
        edges: built.edges,
        diagnostics: [],
        provenance: {
            hash: sha256(input.source),
            tool_version: TOOL_VERSION,
            emitted_at: null,
        },
    });
}
