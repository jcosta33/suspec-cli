import { describe, it, expect } from 'vitest';

import { parse_review_packet } from '../services/parseReviewPacket.ts';

const PACKET = `---
type: review
id: REVIEW-feat
task: TASK-feat
status: needs-human
---

# Review: feat

## Summary

what changed.

## Changed files

- \`src/a.ts\`

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | \`pnpm test\` output pasted | no |
| AC-002 | Unverified |  | yes |

## Human attention

1. AC-002 unverified.

## Suggested decision

Block until AC-002 has evidence.
`;

describe('parse_review_packet', () => {
    it('reads the frontmatter status', () => {
        expect(parse_review_packet(PACKET).status).toBe('needs-human');
        expect(parse_review_packet('no frontmatter\n').status).toBeNull();
    });

    it('reads the H2 section titles', () => {
        expect(parse_review_packet(PACKET).sectionTitles).toEqual([
            'Summary',
            'Changed files',
            'Requirement coverage',
            'Human attention',
            'Suggested decision',
        ]);
    });

    it('reads the coverage rows (id / result / evidence), skipping header + separator', () => {
        expect(parse_review_packet(PACKET).coverageRows).toEqual([
            { id: 'AC-001', result: 'Pass', evidence: '`pnpm test` output pasted' },
            { id: 'AC-002', result: 'Unverified', evidence: '' },
        ]);
    });

    it('reads GFM coverage rows when either outer pipe is omitted', () => {
        const packet = `---
status: draft
---
## Requirement coverage

ID | Result | Evidence
---|---|---
| AC-001 | Pass | leading only
AC-002 | Pass | trailing only |
AC-003 | Pass | neither
| AC-004 | Pass | both |
`;
        expect(parse_review_packet(packet).coverageRows).toEqual([
            { id: 'AC-001', result: 'Pass', evidence: 'leading only' },
            { id: 'AC-002', result: 'Pass', evidence: 'trailing only' },
            { id: 'AC-003', result: 'Pass', evidence: 'neither' },
            { id: 'AC-004', result: 'Pass', evidence: 'both' },
        ]);
    });

    it('ignores non-id table rows and tables outside the coverage section', () => {
        const noisy = `---
status: draft
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |

## Other table

| a | b |
|---|---|
| AC-099 | Pass |
`;
        expect(parse_review_packet(noisy).coverageRows).toEqual([{ id: 'AC-001', result: 'Pass', evidence: 'x' }]);
    });

    it('drops a coverage-table row whose ID cell is not requirement-id-shaped (lowercase / prose)', () => {
        // The in-coverage shape guard: a row inside the coverage table whose first cell does not match
        // the requirement-id shape is dropped from coverageRows (it never reaches C012 as an orphan).
        const malformed = `---
status: draft
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |
| ac-002 | Pass | x | no |
| notes | see below | | |
`;
        expect(parse_review_packet(malformed).coverageRows).toEqual([{ id: 'AC-001', result: 'Pass', evidence: 'x' }]);
    });

    it('a plain (non-verify) fence inside the coverage section emits no verify block', () => {
        // Only a ```verify info-string opens a structured-evidence block; any other fence in the
        // coverage section is verbatim example text — ignored, not misread as a binding.
        const plainFence = `---
status: draft
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |

\`\`\`text
id=AC-001 cmd="a test" result=pass
\`\`\`
`;
        const parsed = parse_review_packet(plainFence);
        expect(parsed.verifyBlocks).toEqual([]);
        expect(parsed.coverageRows).toEqual([{ id: 'AC-001', result: 'Pass', evidence: 'x' }]);
    });

    it('a frontmatter with no status reads null', () => {
        expect(parse_review_packet('---\ntask: TASK-x\n---\n# r\n').status).toBeNull();
    });

    it('an empty status value reads null', () => {
        expect(parse_review_packet('---\nstatus:\ntask: TASK-x\n---\n# r\n').status).toBeNull();
    });

    it('a short coverage row (missing Result/Evidence columns) reads empty for the absent cells', () => {
        const short = `---
status: draft
---
## Requirement coverage

| ID | Result | Evidence |
|---|---|---|
| AC-001 |
`;
        expect(parse_review_packet(short).coverageRows).toEqual([{ id: 'AC-001', result: '', evidence: '' }]);
    });

    it('an empty pipe-only line in the coverage section is skipped, not a crash', () => {
        const empty = `---
status: draft
---
## Requirement coverage

|
| AC-001 | Pass | p | no |
`;
        expect(parse_review_packet(empty).coverageRows).toEqual([{ id: 'AC-001', result: 'Pass', evidence: 'p' }]);
    });

    it('parses a verify block into {id, cmd, result} and leaves the body unparsed (AC-004)', () => {
        const packet = `---
status: needs-human
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | see verify block | no |

\`\`\`verify id=AC-001 cmd="npm test -- auth-refresh.spec.ts" result=pass
replays-after-refresh ✓  (1 passed, 0 failed)
| this pipe row in the body must NOT be read as a coverage row
result=fail and id=AC-999 in the body must NOT be parsed
\`\`\`

## Human attention
x
`;
        const parsed = parse_review_packet(packet);
        expect(parsed.verifyBlocks).toEqual([
            { id: 'AC-001', cmd: 'npm test -- auth-refresh.spec.ts', result: 'pass', malformed: false },
        ]);
        // The fenced body is verbatim and unparsed: its pipe row is not a coverage row, and its
        // `result=fail` / `id=AC-999` tokens never leak into a second block.
        expect(parsed.coverageRows).toEqual([{ id: 'AC-001', result: 'Pass', evidence: 'see verify block' }]);
    });

    it('surfaces a malformed verify block rather than dropping it (AC-004)', () => {
        const packet = `---
status: needs-human
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |

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
        const parsed = parse_review_packet(packet);
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
status: needs-human
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`
`;
        const parsed = parse_review_packet(packet);
        // Both blocks are kept (the duplicate is the surfaced fact, downstream in C013) — not dropped.
        expect(parsed.verifyBlocks).toHaveLength(2);
        expect(parsed.verifyBlocks.every((b) => b.id === 'AC-001')).toBe(true);
    });

    it('does not misread id/result tokens that sit inside the quoted cmd (AC-004)', () => {
        const packet = `---
status: needs-human
---
## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |

\`\`\`verify id=AC-001 cmd="echo result=fail id=AC-999" result=pass
out
\`\`\`
`;
        // The `result=fail` and `id=AC-999` inside the quoted cmd must not override the binding's own
        // `id=AC-001` / `result=pass`.
        expect(parse_review_packet(packet).verifyBlocks).toEqual([
            { id: 'AC-001', cmd: 'echo result=fail id=AC-999', result: 'pass', malformed: false },
        ]);
    });

    it('ignores a verify fence outside the coverage section', () => {
        const packet = `---
status: needs-human
---
## Summary

\`\`\`verify id=AC-001 cmd="a test" result=pass
out
\`\`\`

## Requirement coverage

| ID | Result | Evidence | Human attention |
|---|---|---|---|
| AC-001 | Pass | x | no |
`;
        expect(parse_review_packet(packet).verifyBlocks).toEqual([]);
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
            '## Summary',
            'Example coverage table:',
            '',
            '```',
            '## Requirement coverage',
            '| ID | Result | Evidence |',
            '|---|---|---|',
            '| AC-999 | Pass | leaked from a code block |',
            '```',
            '',
            '## Changed files',
            '- src/x.ts',
        ].join('\n');
        const parsed = parse_review_packet(packet);
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
            '| ID | Result | Evidence |',
            '|---|---|---|',
            '| AC-001 | Pass | `grep x | wc -l` |',
        ].join('\n');
        const row = parse_review_packet(packet).coverageRows[0];
        expect(row.id).toBe('AC-001');
        expect(row.result).toBe('Pass');
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
            '| ID | Result | Evidence |',
            '|---|---|---|',
            '| AC-001 | Pass | see below |',
            '',
            '```verify cmd="x" cmd="y id=AC-555" result=pass id=AC-001',
            'out',
            '```',
        ].join('\n');
        const block = parse_review_packet(packet).verifyBlocks[0];
        expect(block.id).toBe('AC-001');
        expect(block.result).toBe('pass');
    });
});
