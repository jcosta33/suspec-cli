import { type Result, ok, isErr } from '../../shared/result.ts';
import type { SwarmIr } from '../models/ir.ts';
import type { ParseFailure } from '../models/parse-failure.ts';
import { splitFrontmatter, parseMeta } from '../services/frontmatter.ts';
import { scanBlocks } from '../services/scan-blocks.ts';
import { sha256 } from '../services/digest.ts';

const TOOL_VERSION = 'swarm-core-parser/0.1.0';

export type ParseSpecInput = Readonly<{
    source: string;
    path: string;
}>;

// IF-001: read one *.swarm.md source and derive the typed obligation IR (or a ParseFailure).
// Read-only (C-001): the input string is never mutated; the function holds no state between calls.
// Increment 1 emits typed, source-mapped nodes (AC-001, AC-004); edges[] and diagnostics[] are populated by
// later increments (AC-003, AC-005), so they are empty — not omitted — to keep the IR shape stable (IF-002).
export const parseSpec = (input: ParseSpecInput): Result<SwarmIr, ParseFailure> => {
    const split = splitFrontmatter(input.source);
    if (isErr(split)) {
        return split;
    }
    const meta = parseMeta({
        lines: split.value.lines,
        frontmatter_end_line: split.value.frontmatter_end_line,
    });
    if (isErr(meta)) {
        return meta;
    }
    const nodes = scanBlocks({
        lines: split.value.lines,
        first_body_index: split.value.frontmatter_end_line,
        file: input.path,
    });
    return ok({
        meta: meta.value,
        nodes,
        edges: [],
        diagnostics: [],
        provenance: {
            hash: sha256(input.source),
            tool_version: TOOL_VERSION,
            emitted_at: null,
        },
    });
};
