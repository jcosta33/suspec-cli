import type { RawBlock } from './scanBlocks.ts';
import type { IrNode, IrEdge, ObligationClauses } from '../models/ir.ts';

// Surface-keyword clause lines, lowered to their snake_case IR fields (AC-002). Each matches at the
// start of a (trimmed) body line. `VERIFY BY` may repeat; the list-valued clauses split on commas.
const VERIFY_BY = /^VERIFY BY\s+(.+)$/;
const WRITES = /^WRITES\s+(.+)$/;
const READS = /^READS\s+(.+)$/;
const RISK = /^RISK\s+(.+)$/;

// Relationship clauses → edges (AC-003). These are NOT lowered onto the node (I-001).
const DEPENDS_ON = /^DEPENDS ON\s+(.+)$/;
const AFFECTS = /^AFFECTS\s+(.+)$/;

function split_list(rest: string): string[] {
    return rest
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

// Lower a block's surface-keyword clauses to snake_case fields (AC-002). Relationship clauses are skipped
// here — they become edges, never node scalars (I-001).
export function lower_clauses(bodyLines: readonly string[]): ObligationClauses {
    const verifyBy: string[] = [];
    let writes: readonly string[] = [];
    let reads: readonly string[] = [];
    let risk: string | null = null;

    for (const raw of bodyLines) {
        const line = raw.trim();
        const verifyMatch = VERIFY_BY.exec(line);
        if (verifyMatch !== null) {
            verifyBy.push(verifyMatch[1].trim());
            continue;
        }
        const writesMatch = WRITES.exec(line);
        if (writesMatch !== null) {
            writes = split_list(writesMatch[1]);
            continue;
        }
        const readsMatch = READS.exec(line);
        if (readsMatch !== null) {
            reads = split_list(readsMatch[1]);
            continue;
        }
        const riskMatch = RISK.exec(line);
        if (riskMatch !== null) {
            risk = riskMatch[1].trim();
        }
    }
    return { verify_by: verifyBy, writes, reads, risk };
}

// Extract the explicit relationship clauses of one block as edges (AC-003). Each is recorded once, in
// `edges[]` only (I-001). `DEPENDS ON` is a hard edge (a real prerequisite); `AFFECTS` is soft.
export function extract_edges(fromId: string, bodyLines: readonly string[]): IrEdge[] {
    const edges: IrEdge[] = [];
    for (const raw of bodyLines) {
        const line = raw.trim();
        const dependsMatch = DEPENDS_ON.exec(line);
        if (dependsMatch !== null) {
            for (const target of split_list(dependsMatch[1])) {
                edges.push({ from: fromId, to: target, type: 'depends_on', hard: true });
            }
            continue;
        }
        const affectsMatch = AFFECTS.exec(line);
        if (affectsMatch !== null) {
            for (const target of split_list(affectsMatch[1])) {
                edges.push({ from: fromId, to: target, type: 'affects', hard: false });
            }
        }
    }
    return edges;
}

export type BuiltIr = Readonly<{ nodes: IrNode[]; edges: IrEdge[] }>;

// Turn raw blocks into the final nodes (with lowered clauses) + the single relationship store (edges[]).
export function build_nodes_and_edges(blocks: readonly RawBlock[]): BuiltIr {
    const nodes: IrNode[] = [];
    const edges: IrEdge[] = [];
    for (const block of blocks) {
        nodes.push({
            id: block.id,
            kind: block.kind,
            source: block.source,
            clauses: lower_clauses(block.body_lines),
        });
        edges.push(...extract_edges(block.id, block.body_lines));
    }
    return { nodes, edges };
}
