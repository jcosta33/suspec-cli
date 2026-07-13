import { describe, expect, it } from 'vitest';

import { parse_task_packet } from '../useCases/parseTaskPacket.ts';

function packet(scope: string): string {
    return `---
type: task
id: TASK-feat
source: [SPEC-feat]
${scope}
status: review-ready
---

# Task

## Verify

\`\`\`text
ok
\`\`\`
`;
}

function parse(source: string) {
    const result = parse_task_packet(source);
    if (!result.ok) throw result.error;
    return result.value;
}

describe('parse_task_packet', () => {
    it('reads inline and block list scopes', () => {
        expect(parse(packet('scope: [AC-001, AC-002, C-003]')).frontmatter.scope).toEqual([
            'AC-001',
            'AC-002',
            'C-003',
        ]);
        expect(parse(packet('scope:\n  - AC-001\n  - AC-002')).frontmatter.scope).toEqual(['AC-001', 'AC-002']);
    });

    it('preserves comments outside list values', () => {
        expect(parse(packet('scope: [AC-001] # current slice')).frontmatter.scope).toEqual(['AC-001']);
        expect(parse(packet('scope:\n  # current slice\n  - AC-001')).frontmatter.scope).toEqual(['AC-001']);
    });

    it('reads sections, Verify content, and resolution text', () => {
        const parsed = parse(packet('scope: [AC-001]'));
        expect(parsed.sectionTitles).toContain('Verify');
        expect(parsed.verifyBody).toContain('ok');
        expect(parsed.resolutionText).toContain('# Task');
    });

    it('reads an indented Verify heading with closing hashes', () => {
        const parsed = parse(packet('scope: [AC-001]').replace('## Verify', '   ## Verify ##'));
        expect(parsed.sectionTitles).toContain('Verify');
        expect(parsed.verifyBody).toContain('ok');
    });

    it('keeps inline code but drops fenced output from resolution text', () => {
        const parsed = parse(`${packet('scope: [AC-001]')}\nOpen item: \`TODO\`\n\n\`\`\`text\nTBD\n\`\`\`\n`);
        expect(parsed.resolutionText).toContain('`TODO`');
        expect(parsed.resolutionText).not.toContain('TBD');
    });

    it('rejects scalar, wrapped, absent, and malformed scope', () => {
        expect(parse_task_packet(packet('scope: AC-007')).ok).toBe(false);
        expect(parse_task_packet(packet('scope: [AC-001,\n  AC-002]')).ok).toBe(false);
        expect(parse_task_packet(packet('owner: Jane')).ok).toBe(true);
        expect(parse_task_packet('# Task\n').ok).toBe(false);
    });
});
