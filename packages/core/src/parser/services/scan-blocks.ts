import { sha256 } from './digest.ts';
import { BLOCK_KINDS, type BlockKind, type IrNode } from '../models/ir.ts';

// A SOL block header: one of the 7 keywords, an id token, an optional `[annotation]`, then a colon.
// Requiring the trailing colon keeps prose lines ("INTERFACE blocks each MUST…") from matching.
const HEADER_PATTERN = /^(REQ|CONSTRAINT|INVARIANT|INTERFACE|QUESTION|TRACE|VERDICT)\s+([A-Za-z][A-Za-z0-9-]*)\s*(?:\[[^\]]*\])?\s*:/;
const SECTION_PATTERN = /^##\s/;

const isBlockKind = (token: string): token is BlockKind => (BLOCK_KINDS as readonly string[]).includes(token);

export type ScanBlocksInput = Readonly<{
    lines: readonly string[];
    first_body_index: number;
    file: string;
}>;

// The 0-based indices where a block ends: a block header or a `## ` section header (both close the prior block).
const findBoundaries = (lines: readonly string[], firstBodyIndex: number): number[] => {
    const boundaries: number[] = [];
    for (let index = firstBodyIndex; index < lines.length; index += 1) {
        if (HEADER_PATTERN.test(lines[index]) || SECTION_PATTERN.test(lines[index])) {
            boundaries.push(index);
        }
    }
    return boundaries;
};

// Emit one source-mapped node per recognized block header (AC-001, AC-004). Pure; reads `lines`, never writes.
export const scanBlocks = (input: ScanBlocksInput): IrNode[] => {
    const boundaries = findBoundaries(input.lines, input.first_body_index);
    const nodes: IrNode[] = [];
    for (let position = 0; position < boundaries.length; position += 1) {
        const headerIndex = boundaries[position];
        const headerMatch = HEADER_PATTERN.exec(input.lines[headerIndex]);
        if (headerMatch === null) {
            continue; // a `## ` section boundary, not a block header
        }
        const keyword = headerMatch[1];
        if (!isBlockKind(keyword)) {
            continue;
        }
        const nextBoundary = position + 1 < boundaries.length ? boundaries[position + 1] : input.lines.length;
        let endIndex = nextBoundary - 1;
        while (endIndex > headerIndex && input.lines[endIndex].trim() === '') {
            endIndex -= 1;
        }
        const spanText = input.lines.slice(headerIndex, endIndex + 1).join('\n');
        nodes.push({
            id: headerMatch[2],
            kind: keyword,
            source: {
                file: input.file,
                line_start: headerIndex + 1,
                line_end: endIndex + 1,
                content_hash: sha256(spanText),
            },
        });
    }
    return nodes;
};
