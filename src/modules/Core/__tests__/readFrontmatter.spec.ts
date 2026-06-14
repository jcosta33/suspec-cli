import { describe, it, expect } from 'vitest';

import { read_frontmatter } from '../services/readFrontmatter.ts';

describe('read_frontmatter', () => {
    it('reads scalar key: value pairs from the leading block', () => {
        expect(read_frontmatter('---\nid: SPEC-1\nstatus: ready\n---\n# body\n')).toEqual({
            id: 'SPEC-1',
            status: 'ready',
        });
    });

    it('returns {} when there is no frontmatter fence', () => {
        expect(read_frontmatter('# just a heading\n')).toEqual({});
    });

    it('parses a YAML block list into a string array (the task `source` shape)', () => {
        const source = '---\ntype: task\nid: TASK-1\nsource:\n  - SPEC-feat\n  - CHANGE-feat\nstatus: ready\n---\n# body\n';
        expect(read_frontmatter(source)).toEqual({
            type: 'task',
            id: 'TASK-1',
            source: ['SPEC-feat', 'CHANGE-feat'],
            status: 'ready',
        });
    });

    it('handles a single-item block list and resumes scalar parsing after it', () => {
        // The kit task template: a `# - CHANGE` comment line is not a list item and ends the list.
        const source = '---\nsource:\n  - SPEC-x\n  # - CHANGE-x (when a change-plan applies)\nstatus: ready\n---\n';
        expect(read_frontmatter(source)).toEqual({ source: ['SPEC-x'], status: 'ready' });
    });

    it('omits a bare key with no following list items, and stops at the closing fence', () => {
        const source = '---\nid: X\nempty:\nnot a key line\n---\nid: ignored-in-body\n';
        expect(read_frontmatter(source)).toEqual({ id: 'X' });
    });
});
