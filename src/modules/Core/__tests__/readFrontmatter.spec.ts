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

    it('skips empty values, list items, and non-key lines, and stops at the closing fence', () => {
        const source = '---\nid: X\nempty:\n  - a list item\nnot a key line\n---\nid: ignored-in-body\n';
        expect(read_frontmatter(source)).toEqual({ id: 'X' });
    });
});
