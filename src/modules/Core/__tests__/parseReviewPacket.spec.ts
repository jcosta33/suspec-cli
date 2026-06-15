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
        expect(parse_review_packet(noisy).coverageRows).toEqual([
            { id: 'AC-001', result: 'Pass', evidence: 'x' },
        ]);
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
});
