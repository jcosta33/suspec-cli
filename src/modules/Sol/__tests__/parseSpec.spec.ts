import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import { parse_spec } from '../useCases/parseSpec.ts';
import { BLOCK_KINDS, EDGE_TYPES } from '../models/ir.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

// ── Fixtures ────────────────────────────────────────────────────────────────

// One block of each of the 7 closed kinds.
const ALL_BLOCKS_SPEC = `---
type: spec
id: fixture-all-blocks
swarm_language: SOL/0.1
spec_version: 0.1.0
---

# Spec: fixture — one of each block type

## Interfaces

INTERFACE IF-001:
\`doThing\` RETURNS \`Result\`
OWNED BY fixture
VERIFY BY contract:cmdTest:t.spec.ts#x

## Obligations

REQ AC-001:
WHEN something happens
THE system MUST respond
VERIFY BY test:cmdTest:t.spec.ts#y

## Constraints

CONSTRAINT C-001:
THE system MUST NOT leak
BECAUSE leaking is unsafe
VERIFY BY static:cmdTest:t.spec.ts#z

## Invariants

INVARIANT I-001:
the balance MUST never go negative
VERIFY BY property:cmdTest:t.spec.ts#h

## Questions

QUESTION Q-001 [non-blocking]:
Should we cache the result?
AFFECTS AC-001

## Trace

TRACE T-001:
IMPLEMENTS AC-001
PROOF test:cmdTest:t.spec.ts#y PASS

## Review

VERDICT AC-001: PASS
REASON the bound proof ran and satisfies
EVIDENCE t.spec.ts#y
`;
const FIXTURE_PATH = 'fixture-all-blocks.swarm.md';

// Clause-rich: VERIFY BY / WRITES / READS / RISK on a node, plus DEPENDS ON and AFFECTS relationships.
const RICH_OBLIGATION_SPEC = `---
type: spec
id: fixture-rich
swarm_language: SOL/0.1
spec_version: 0.1.0
---

# Spec: fixture — clauses and relationships

## Obligations

REQ AC-001:
WHEN a request arrives
THE service MUST persist it
VERIFY BY test:cmdTest:t.spec.ts#persist
DEPENDS ON IF-001
READS config/app.json
WRITES src/db/store.ts, src/db/index.ts
RISK high

REQ AC-002:
WHEN persistence fails
THE service MUST retry with backoff
VERIFY BY test:cmdTest:t.spec.ts#retry
AFFECTS AC-001
`;
const RICH_PATH = 'fixture-rich.swarm.md';

// Multiple same-kind blocks, for the adequacy checks.
const MULTI_BLOCK_SPEC = `---
type: spec
id: multi-block
swarm_language: SOL/0.1
spec_version: 0.1.0
---

# Spec: multiple blocks of the same kind

## Obligations

REQ AC-001:
WHEN a happens
THE system MUST alpha
VERIFY BY test:cmdTest:t#a

REQ AC-002:
WHEN b happens
THE system MUST beta
VERIFY BY test:cmdTest:t#b

REQ AC-003:
WHEN c happens
THE system MUST gamma
VERIFY BY test:cmdTest:t#c

## Constraints

CONSTRAINT C-001:
THE system MUST NOT delta
BECAUSE reasons
VERIFY BY static:cmdTest:t#d
`;

const expected_hash = (text: string): string => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const source_bindings = (source: string): string[] =>
    source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('VERIFY BY '))
        .map((line) => line.slice('VERIFY BY '.length).trim());

// ── IF-001: parse a *.swarm.md into a typed IR (or a ParseFailure) ───────────

describe('parse_spec (IF-001)', () => {
    it('parses_seven_block_types', () => {
        const ir = assertOk(parse_spec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH }));
        const kinds = ir.nodes.map((node) => node.kind);
        expect(ir.nodes).toHaveLength(7);
        for (const kind of BLOCK_KINDS) {
            expect(kinds).toContain(kind);
        }
    });

    it('returns_unparseable_frontmatter_when_no_fence', () => {
        const error = assertErr(parse_spec({ source: '# no frontmatter\n\nREQ AC-001:\nTHE x MUST y\n', path: 'bad.md' }));
        expect(error._tag).toBe('ParseFailure');
        expect(error.reason).toBe('unparseable-frontmatter');
    });
});

// ── IF-002: the SwarmIr shape ────────────────────────────────────────────────

describe('SwarmIr shape (IF-002)', () => {
    it('ir_matches_schema', () => {
        const ir = assertOk(parse_spec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH }));
        expect(Object.keys(ir).sort()).toEqual(['diagnostics', 'edges', 'meta', 'nodes', 'provenance']);
        expect(ir.meta).toEqual({ id: 'fixture-all-blocks', language: 'SOL/0.1', spec_version: '0.1.0' });
        expect(Array.isArray(ir.nodes)).toBe(true);
        expect(Array.isArray(ir.edges)).toBe(true);
        expect(Array.isArray(ir.diagnostics)).toBe(true);
        expect(Object.keys(ir.provenance).sort()).toEqual(['emitted_at', 'hash', 'tool_version']);
        expect(ir.provenance.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(ir.provenance.emitted_at).toBeNull();
    });
});

// ── AC-001: one typed node per block ─────────────────────────────────────────

describe('typed nodes (AC-001)', () => {
    it('one_node_per_block_typed', () => {
        const ir = assertOk(parse_spec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH }));
        expect(ir.nodes.map((node) => `${node.kind} ${node.id}`)).toEqual([
            'INTERFACE IF-001',
            'REQ AC-001',
            'CONSTRAINT C-001',
            'INVARIANT I-001',
            'QUESTION Q-001',
            'TRACE T-001',
            'VERDICT AC-001',
        ]);
        for (const node of ir.nodes) {
            expect(BLOCK_KINDS).toContain(node.kind);
        }
    });
});

// ── AC-004: source mapping ───────────────────────────────────────────────────

describe('source mapping (AC-004)', () => {
    it('every_node_source_mapped', () => {
        const ir = assertOk(parse_spec({ source: ALL_BLOCKS_SPEC, path: FIXTURE_PATH }));
        const lines = ALL_BLOCKS_SPEC.split('\n');
        for (const node of ir.nodes) {
            const { source } = node;
            expect(source.file).toBe(FIXTURE_PATH);
            expect(source.line_start).toBeGreaterThanOrEqual(1);
            expect(source.line_end).toBeGreaterThanOrEqual(source.line_start);
            expect(source.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
            const spanText = lines.slice(source.line_start - 1, source.line_end).join('\n');
            expect(source.content_hash).toBe(expected_hash(spanText));
            expect(lines[source.line_start - 1]).toContain(node.id);
        }
    });
});

// ── C-001: read-only parse ───────────────────────────────────────────────────

describe('read-only parse (C-001)', () => {
    it('source_byte_identical_after_parse', () => {
        const source = `${ALL_BLOCKS_SPEC}`;
        const before = source;
        const first = parse_spec({ source, path: FIXTURE_PATH });
        expect(source).toBe(before);
        const second = parse_spec({ source, path: FIXTURE_PATH });
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });
});

// ── Adequacy: multiple same-kind blocks, non-overlapping spans ───────────────

describe('parser adequacy (AC-001 / AC-004 hardening)', () => {
    it('splits_multiple_same_kind_blocks', () => {
        const ir = assertOk(parse_spec({ source: MULTI_BLOCK_SPEC, path: 'multi.swarm.md' }));
        expect(ir.nodes.map((node) => `${node.kind} ${node.id}`)).toEqual([
            'REQ AC-001',
            'REQ AC-002',
            'REQ AC-003',
            'CONSTRAINT C-001',
        ]);
    });

    it('block_spans_do_not_overlap_or_bleed', () => {
        const ir = assertOk(parse_spec({ source: MULTI_BLOCK_SPEC, path: 'multi.swarm.md' }));
        const spans = ir.nodes.map((node) => node.source).sort((a, b) => a.line_start - b.line_start);
        for (let index = 0; index + 1 < spans.length; index += 1) {
            expect(spans[index].line_end).toBeLessThan(spans[index + 1].line_start);
            expect(spans[index].line_end).toBeGreaterThanOrEqual(spans[index].line_start);
        }
    });
});

// ── AC-002: clause lowering ──────────────────────────────────────────────────

describe('clause lowering (AC-002)', () => {
    it('keywords_to_snake_case', () => {
        const ir = assertOk(parse_spec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH }));
        const ac1 = ir.nodes.find((node) => node.id === 'AC-001');
        if (ac1 === undefined) {
            throw new Error('AC-001 not parsed');
        }
        expect(ac1.clauses.verify_by).toEqual(['test:cmdTest:t.spec.ts#persist']);
        expect(ac1.clauses.reads).toEqual(['config/app.json']);
        expect(ac1.clauses.writes).toEqual(['src/db/store.ts', 'src/db/index.ts']);
        expect(ac1.clauses.risk).toBe('high');

        const ac2 = ir.nodes.find((node) => node.id === 'AC-002');
        expect(ac2?.clauses.writes).toEqual([]);
        expect(ac2?.clauses.reads).toEqual([]);
        expect(ac2?.clauses.risk).toBeNull();
        expect(ac2?.clauses.verify_by).toEqual(['test:cmdTest:t.spec.ts#retry']);
    });
});

// ── AC-003 / I-001: relationships as edges, never node scalars ───────────────

describe('relationships as edges (AC-003 / I-001)', () => {
    it('relationships_are_edges', () => {
        const ir = assertOk(parse_spec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH }));
        expect(ir.edges).toContainEqual({ from: 'AC-001', to: 'IF-001', type: 'depends_on', hard: true });
        expect(ir.edges).toContainEqual({ from: 'AC-002', to: 'AC-001', type: 'affects', hard: false });
        expect(ir.edges).toHaveLength(2);
    });

    it('no_relationship_as_node_scalar', () => {
        const ir = assertOk(parse_spec({ source: RICH_OBLIGATION_SPEC, path: RICH_PATH }));
        for (const node of ir.nodes) {
            expect(node).not.toHaveProperty('depends_on');
            expect(node).not.toHaveProperty('affects');
            expect(Object.keys(node.clauses)).toEqual(['verify_by', 'writes', 'reads', 'risk']);
        }
    });
});

// ── I-002: lossless for binding content ──────────────────────────────────────

describe('lossless lowering (I-002)', () => {
    it.each([
        ['all-blocks', ALL_BLOCKS_SPEC, FIXTURE_PATH],
        ['rich', RICH_OBLIGATION_SPEC, RICH_PATH],
    ])('source_obligations_recoverable_from_ir [%s]', (_name, source, path) => {
        const ir = assertOk(parse_spec({ source, path }));
        const recovered = new Set(ir.nodes.flatMap((node) => node.clauses.verify_by));
        const inSource = source_bindings(source);
        expect(inSource.length).toBeGreaterThan(0);
        for (const binding of inSource) {
            expect(recovered).toContain(binding);
        }
    });
});

// ── C-002: closed-set conformance ────────────────────────────────────────────

describe('closed-set conformance (C-002)', () => {
    it('emitted_values_in_closed_sets', () => {
        for (const [source, path] of [
            [ALL_BLOCKS_SPEC, FIXTURE_PATH],
            [RICH_OBLIGATION_SPEC, RICH_PATH],
        ] as const) {
            const ir = assertOk(parse_spec({ source, path }));
            for (const node of ir.nodes) {
                expect(BLOCK_KINDS).toContain(node.kind);
            }
            for (const edge of ir.edges) {
                expect(EDGE_TYPES).toContain(edge.type);
            }
        }
    });
});
