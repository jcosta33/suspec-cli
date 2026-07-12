import { describe, it, expect } from 'vitest';

import { parse_task_packet } from '../useCases/parseTaskPacket.ts';

function packet(scopeLine: string): string {
    return `---
type: task
id: TASK-feat
${scopeLine}
status: review-ready
---

# Task
`;
}

describe('parse_task_packet', () => {
    it('splits a flow-style scope into requirement ids', () => {
        expect(parse_task_packet(packet('scope: [AC-001, AC-002, C-003]')).scope).toEqual([
            'AC-001',
            'AC-002',
            'C-003',
        ]);
    });

    it('reads a bare scalar scope', () => {
        expect(parse_task_packet(packet('scope: AC-007')).scope).toEqual(['AC-007']);
    });

    it('reads wrapped, next-line, and block-style scopes', () => {
        expect(parse_task_packet(packet('scope: [AC-001,\n  AC-002,\n  AC-003]')).scope).toEqual([
            'AC-001',
            'AC-002',
            'AC-003',
        ]);
        expect(parse_task_packet(packet('scope:\n  [AC-001, AC-002, PG-001]')).scope).toEqual([
            'AC-001',
            'AC-002',
            'PG-001',
        ]);
        expect(parse_task_packet(packet('scope:\n  - AC-001\n  - AC-002')).scope).toEqual(['AC-001', 'AC-002']);
    });

    it('stops a scalar at the next frontmatter key', () => {
        expect(parse_task_packet(packet('scope: AC-007')).scope).toEqual(['AC-007']);
    });

    it('returns an empty scope for absent, empty, or unparseable frontmatter', () => {
        expect(parse_task_packet(packet('scope: []')).scope).toEqual([]);
        expect(parse_task_packet(packet('owner: Jane')).scope).toEqual([]);
        expect(parse_task_packet('# Task\n').scope).toEqual([]);
    });
});
