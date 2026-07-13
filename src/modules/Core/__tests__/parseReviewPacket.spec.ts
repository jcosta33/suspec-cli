import { describe, it, expect } from 'vitest';

import { parse_review_packet } from '../services/parseReviewPacket.ts';

function parse_review(source: string) {
    const result = parse_review_packet(source);
    if (!result.ok) throw result.error;
    return result.value;
}

const PACKET = `---
type: review
id: REVIEW-feat
task: TASK-feat
decision: pending
---

# Review: feat

## Method notes

what changed.

## Changed files

- \`src/a.ts\`

## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | \`pnpm test\` output pasted |
| AC-002 | Unverified |  |

## Open decisions

1. AC-002 unverified.

## Findings

Block until AC-002 has evidence.
`;

describe('parse_review_packet', () => {
    it('reads the frontmatter decision', () => {
        expect(parse_review(PACKET).decision).toBe('pending');
        expect(parse_review_packet('no frontmatter\n').ok).toBe(false);
    });

    it('reads the frontmatter decision after a UTF-8 BOM', () => {
        expect(parse_review(`\uFEFF${PACKET}`).decision).toBe('pending');
    });

    it('reads the H2 section titles', () => {
        expect(parse_review(PACKET).sectionTitles).toEqual([
            'Method notes',
            'Changed files',
            'Requirement coverage',
            'Open decisions',
            'Findings',
        ]);
    });

    it('reads the coverage rows (id / result / evidence), skipping header + separator', () => {
        expect(parse_review(PACKET).coverageRows).toEqual([
            { id: 'AC-001', assessment: 'Supported', evidence: '`pnpm test` output pasted' },
            { id: 'AC-002', assessment: 'Unverified', evidence: '' },
        ]);
    });

    it('reads GFM coverage rows when either outer pipe is omitted', () => {
        const packet = `---
status: draft
---
## Requirement coverage

ID | Assessment | Evidence
---|---|---
| AC-001 | Supported | leading only
AC-002 | Supported | trailing only |
AC-003 | Supported | neither
| AC-004 | Supported | both |
`;
        expect(parse_review(packet).coverageRows).toEqual([
            { id: 'AC-001', assessment: 'Supported', evidence: 'leading only' },
            { id: 'AC-002', assessment: 'Supported', evidence: 'trailing only' },
            { id: 'AC-003', assessment: 'Supported', evidence: 'neither' },
            { id: 'AC-004', assessment: 'Supported', evidence: 'both' },
        ]);
    });

    it('ignores non-id table rows and tables outside the coverage section', () => {
        const noisy = `---
status: draft
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |

## Other table

| a | b |
|---|---|
| AC-099 | Supported |
`;
        expect(parse_review(noisy).coverageRows).toEqual([{ id: 'AC-001', assessment: 'Supported', evidence: 'x' }]);
    });

    it('drops a coverage-table row whose ID cell is not requirement-id-shaped (lowercase / prose)', () => {
        // The in-coverage shape guard: a row inside the coverage table whose first cell does not match
        // the requirement-id shape is dropped from coverageRows (it never reaches C012 as an orphan).
        const malformed = `---
status: draft
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |
| ac-002 | Supported | x |
| notes | see below | | |
`;
        expect(parse_review(malformed).coverageRows).toEqual([
            { id: 'AC-001', assessment: 'Supported', evidence: 'x' },
        ]);
    });

    it('a plain (non-verify) fence inside the coverage section emits no verify block', () => {
        // Only a ```verify info-string opens a structured-evidence block; any other fence in the
        // coverage section is verbatim example text — ignored, not misread as a binding.
        const plainFence = `---
status: draft
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |

\`\`\`text
id=AC-001 cmd="a test" result=pass
\`\`\`
`;
        const parsed = parse_review(plainFence);
        expect(parsed.verifyBlocks).toEqual([]);
        expect(parsed.coverageRows).toEqual([{ id: 'AC-001', assessment: 'Supported', evidence: 'x' }]);
    });

    it('a frontmatter with no status reads null', () => {
        expect(parse_review('---\ntask: TASK-x\n---\n# r\n').decision).toBeNull();
    });

    it('an empty status value reads null', () => {
        expect(parse_review_packet('---\ndecision:\ntask: TASK-x\n---\n# r\n').ok).toBe(false);
    });

    it('a short coverage row (missing Assessment/Evidence columns) reads empty for the absent cells', () => {
        const short = `---
status: draft
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 |
`;
        expect(parse_review(short).coverageRows).toEqual([{ id: 'AC-001', assessment: '', evidence: '' }]);
    });

    it('an empty pipe-only line in the coverage section is skipped, not a crash', () => {
        const empty = `---
status: draft
---
## Requirement coverage

|
| AC-001 | Supported | p |
`;
        expect(parse_review(empty).coverageRows).toEqual([{ id: 'AC-001', assessment: 'Supported', evidence: 'p' }]);
    });

    it('parses a verify block into {id, cmd, result} and leaves the body unparsed (AC-004)', () => {
        const packet = `---
decision: pending
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | see verify block |

\`\`\`verify id=AC-001 cmd="npm test -- auth-refresh.spec.ts" result=pass
replays-after-refresh ✓  (1 passed, 0 failed)
| this pipe row in the body must NOT be read as a coverage row
result=fail and id=AC-999 in the body must NOT be parsed
\`\`\`

## Open decisions
x
`;
        const parsed = parse_review(packet);
        expect(parsed.verifyBlocks).toEqual([
            { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
        ]);
        // The fenced body is verbatim and unparsed: its pipe row is not a coverage row, and its
        // `result=fail` / `id=AC-999` tokens never leak into a second block.
        expect(parsed.coverageRows).toEqual([{ id: 'AC-001', assessment: 'Supported', evidence: 'see verify block' }]);
    });

    it('surfaces a malformed verify block rather than dropping it (AC-004)', () => {
        const packet = `---
decision: pending
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |

\`\`\`verify id=AC-001 cmd="a test" result=maybe
output
\`\`\`

\`\`\`verify cmd="no id here" result=pass
output
\`\`\`

\`\`\`verify id=AC-002 result=pass
output
\`\`\`

\`\`\`verify id=AC-003 cmd="a test"
output
\`\`\`
`;
        const parsed = parse_review(packet);
        // result=maybe is outside the {pass,fail} enum → result null, malformed. The id-less block →
        // id null, malformed. A block with no cmd="…" token at all → cmd null, malformed. A block with
        // no result= token at all → result null, malformed. All surfaced, none dropped.
        expect(parsed.verifyBlocks).toEqual([
            { id: 'AC-001', cmd: 'a test', result: null, malformed: true },
            { id: null, cmd: 'no id here', result: 'pass', malformed: true },
            { id: 'AC-002', cmd: null, result: 'pass', malformed: true },
            { id: 'AC-003', cmd: 'a test', result: null, malformed: true },
        ]);
    });

    it('surfaces a duplicate verify block keyed to the same id (AC-004)', () => {
        const packet = `---
decision: pending
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`
`;
        const parsed = parse_review(packet);
        // Both blocks are kept (the duplicate is the surfaced fact, downstream in C013) — not dropped.
        expect(parsed.verifyBlocks).toHaveLength(2);
        expect(parsed.verifyBlocks.every((b) => b.id === 'AC-001')).toBe(true);
    });

    it('does not misread id/result tokens that sit inside the quoted cmd (AC-004)', () => {
        const packet = `---
decision: pending
---
## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |

\`\`\`verify id=AC-001 cmd="echo result=fail id=AC-999" result=pass
out
\`\`\`
`;
        // The `result=fail` and `id=AC-999` inside the quoted cmd must not override the binding's own
        // `id=AC-001` / `result=pass`.
        expect(parse_review(packet).verifyBlocks).toEqual([
            { id: 'AC-001', cmd: 'echo result=fail id=AC-999', result: 'pass', malformed: false },
        ]);
    });

    it('ignores a verify fence outside the coverage section', () => {
        const packet = `---
decision: pending
---
## Method notes

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`

## Requirement coverage

| ID | Assessment | Evidence |
|---|---|---|
| AC-001 | Supported | x |
`;
        expect(parse_review(packet).verifyBlocks).toEqual([]);
    });
});

describe('parse_review_packet — markdown structure (#23)', () => {
    it('A1: a `## Requirement coverage` + rows inside a code fence are not parsed as structure', () => {
        const packet = [
            '---',
            'type: review',
            'status: draft',
            '---',
            '',
            '## Method notes',
            'Example coverage table:',
            '',
            '```',
            '## Requirement coverage',
            '| ID | Assessment | Evidence |',
            '|---|---|---|',
            '| AC-999 | Supported | leaked from a code block |',
            '```',
            '',
            '## Changed files',
            '- src/x.ts',
        ].join('\n');
        const parsed = parse_review(packet);
        expect(parsed.coverageRows).toEqual([]);
        expect(parsed.sectionTitles).not.toContain('Requirement coverage');
    });

    it('A3: a piped shell command in an inline-code Evidence cell stays one cell', () => {
        const packet = [
            '---',
            'type: review',
            'status: ready',
            '---',
            '',
            '## Requirement coverage',
            '| ID | Assessment | Evidence |',
            '|---|---|---|',
            '| AC-001 | Supported | `grep x | wc -l` |',
        ].join('\n');
        const row = parse_review(packet).coverageRows[0];
        expect(row.id).toBe('AC-001');
        expect(row.assessment).toBe('Supported');
        expect(row.evidence).toBe('`grep x | wc -l`');
    });

    it('A5: a second cmd="…" cannot steal the binding id (real id read after both commands)', () => {
        const packet = [
            '---',
            'type: review',
            'status: ready',
            '---',
            '',
            '## Requirement coverage',
            '| ID | Assessment | Evidence |',
            '|---|---|---|',
            '| AC-001 | Supported | see below |',
            '',
            '```verify cmd="x" cmd="y id=AC-555" result=pass id=AC-001',
            'out',
            '```',
        ].join('\n');
        const block = parse_review(packet).verifyBlocks[0];
        expect(block.id).toBe('AC-001');
        expect(block.result).toBe('pass');
    });
});
