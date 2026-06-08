import type { RawBlock } from './scanBlocks.ts';
import type { Diagnostic, BlockKind } from '../models/ir.ts';

// The id prefix fixed by block type (`SOL-S005` on mismatch). VERDICT reuses the judged id (no fixed prefix).
const ID_PREFIX: Record<BlockKind, string | null> = {
    REQ: 'AC',
    CONSTRAINT: 'C',
    INVARIANT: 'I',
    INTERFACE: 'IF',
    QUESTION: 'Q',
    TRACE: 'T',
    VERDICT: null,
};

// Only these carry an EARS consequence whose modal/condition structure is checked.
const OBLIGATION_KINDS: readonly BlockKind[] = ['REQ', 'CONSTRAINT', 'INVARIANT'];

// EARS condition triggers.
const TRIGGER = /^(WHEN|IF|WHILE|WHERE)\b/;
// Keyword lines that are metadata/structure, never a consequence (so they are not modal-checked).
const CLAUSE = /^(VERIFY BY|WRITES|READS|RISK|DEPENDS ON|AFFECTS|BECAUSE|EXCEPT|OWNED BY|ACCEPTS|ERRORS|RETURNS|IMPLEMENTS|PRESERVES|CHANGED|PROOF|REASON|EVIDENCE)\b/;
// An explicit actor clause (REQ/CONSTRAINT). INVARIANT states a `<property> MODAL …` without the `THE` lead.
const ACTOR_CLAUSE = /^(THE|AND THE)\b/;

// The deterministic modal scan (C-003): the first uppercase modal *token*, longest-match (`MUST NOT` before
// `MUST`). It NEVER guesses — a lowercase or non-token "modal" simply does not match, so an ambiguous clause
// is reported (`SOL-S003`) rather than split on a guess. The five modals are a closed set.
const MODAL = /(?<![A-Za-z])(MUST NOT|SHOULD NOT|MUST|SHOULD|MAY)(?![A-Za-z])/;

const find_modal = (line: string): string | null => MODAL.exec(line)?.[1] ?? null;

const diagnostic = (code: string, block: RawBlock, message: string, suggest: string): Diagnostic => ({
    code,
    severity: 'BLOCKING',
    layer: 'S',
    span: block.source,
    message,
    suggest,
});

// Structural (SOL-S) diagnostics for one block (AC-005, C-003). Read-only; reports, never repairs.
const diagnose_block = (block: RawBlock): Diagnostic[] => {
    const out: Diagnostic[] = [];

    // SOL-S005 — id prefix must match the block type.
    const prefix = ID_PREFIX[block.kind];
    if (prefix !== null && !block.id.startsWith(`${prefix}-`)) {
        out.push(
            diagnostic('SOL-S005', block, `${block.kind} id "${block.id}" must use the "${prefix}-" prefix`, 'CONCRETIZE: renumber to the type prefix')
        );
    }

    if (!OBLIGATION_KINDS.includes(block.kind)) {
        return out;
    }

    const lines = block.body_lines.map((line) => line.trim()).filter((line) => line.length > 0);
    const triggers = lines.filter((line) => TRIGGER.test(line));
    const consequences = lines.filter((line) => !TRIGGER.test(line) && !CLAUSE.test(line));
    const actorClauses = consequences.filter((line) => ACTOR_CLAUSE.test(line));
    const modals = consequences.map(find_modal).filter((modal): modal is string => modal !== null);
    const hasRationale = lines.some((line) => /^(BECAUSE|EXCEPT)\b/.test(line));

    // SOL-S003 — an explicit actor clause with no modal token (C-003: a lowercase/ambiguous "modal" does not
    // match, so this fires instead of guessing a split).
    for (const clause of actorClauses) {
        if (find_modal(clause) === null) {
            out.push(
                diagnostic('SOL-S003', block, `actor clause "${clause}" has no modal token (MUST/SHOULD/MAY); the parser does not guess one`, 'NORMALIZE: add an explicit uppercase modal')
            );
        }
    }

    // SOL-S001 — a condition is present but no consequence carries a modal (dangling condition).
    if (triggers.length > 0 && modals.length === 0) {
        out.push(
            diagnostic('SOL-S001', block, 'condition present but no actor clause with a modal consequence (dangling condition)', 'NORMALIZE: add a "THE <actor> MUST …" consequence')
        );
    }

    // SOL-S006 — SHOULD / SHOULD NOT requires an accompanying BECAUSE or EXCEPT.
    if (modals.some((modal) => modal === 'SHOULD' || modal === 'SHOULD NOT') && !hasRationale) {
        out.push(
            diagnostic('SOL-S006', block, 'SHOULD / SHOULD NOT requires an accompanying BECAUSE or EXCEPT', 'NORMALIZE: add a BECAUSE rationale')
        );
    }

    return out;
};

// All structural diagnostics across the parsed blocks.
export const diagnose_blocks = (blocks: readonly RawBlock[]): Diagnostic[] => blocks.flatMap(diagnose_block);
