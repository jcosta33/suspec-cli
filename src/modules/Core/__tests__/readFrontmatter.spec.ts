import { describe, it, expect } from 'vitest';

import { read_frontmatter, upsert_frontmatter } from '../services/readFrontmatter.ts';

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
        const source =
            '---\ntype: task\nid: TASK-1\nsource:\n  - SPEC-feat\n  - CHANGE-feat\nstatus: ready\n---\n# body\n';
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

    it('tolerates CRLF line endings and a leading UTF-8 BOM', () => {
        const crlf = '---\r\nid: SPEC-x\r\nsource:\r\n  - SPEC-a\r\nstatus: ready\r\n---\r\n';
        expect(read_frontmatter(crlf)).toEqual({ id: 'SPEC-x', source: ['SPEC-a'], status: 'ready' });
        expect(read_frontmatter('---\rid: SPEC-cr\r---\r')).toEqual({ id: 'SPEC-cr' }); // lone-CR (old Mac)
        expect(read_frontmatter('﻿---\nid: SPEC-y\n---\n')).toEqual({ id: 'SPEC-y' });
    });
});

describe('upsert_frontmatter', () => {
    it('updates an existing key in place, preserving the rest of the file', () => {
        const out = upsert_frontmatter('---\nid: SPEC-1\nsnapshot: old\n---\n# body\n', { snapshot: 'new' });
        expect(read_frontmatter(out)).toEqual({ id: 'SPEC-1', snapshot: 'new' });
        expect(out).toContain('# body'); // body untouched
    });

    it('inserts a new key before the closing fence', () => {
        const out = upsert_frontmatter('---\nid: SPEC-1\n---\n# body\n', { snapshot: 'abc' });
        expect(read_frontmatter(out)).toEqual({ id: 'SPEC-1', snapshot: 'abc' });
    });

    it('upserts multiple keys (update + insert) at once', () => {
        const out = upsert_frontmatter('---\nid: R\nreviewed_sha: old\n---\n', { reviewed_sha: 's', evidence_hash: 'h' });
        expect(read_frontmatter(out)).toEqual({ id: 'R', reviewed_sha: 's', evidence_hash: 'h' });
    });

    it('returns the source unchanged when there is no frontmatter fence', () => {
        const src = '# no frontmatter\n';
        expect(upsert_frontmatter(src, { snapshot: 'x' })).toBe(src);
    });

    it('replaces a block-list key with a scalar, leaving no orphaned list items', () => {
        const out = upsert_frontmatter('---\nid: T\nsource:\n  - SPEC-A\n  - SPEC-B\nstatus: ready\n---\n# body\n', {
            source: 'SPEC-C',
        });
        expect(read_frontmatter(out)).toEqual({ id: 'T', source: 'SPEC-C', status: 'ready' });
        expect(out).not.toContain('- SPEC-A'); // the old list items are gone, not orphaned into the body
        expect(out).toContain('# body');
    });

    it('collapses a duplicate key to the single stamped value (no stale second copy)', () => {
        const out = upsert_frontmatter('---\nid: R\nsnapshot: old1\nsnapshot: old2\n---\n', { snapshot: 'new' });
        expect((out.match(/snapshot:/g) ?? []).length).toBe(1);
        expect(read_frontmatter(out).snapshot).toBe('new');
    });

    it('preserves a body line that equals --- (a horizontal rule below the closing fence)', () => {
        const out = upsert_frontmatter('---\nid: X\n---\n\nintro\n\n---\n\nmore\n', { snapshot: 's' });
        expect(read_frontmatter(out)).toEqual({ id: 'X', snapshot: 's' });
        expect(out).toContain('intro');
        expect(out).toContain('more'); // the body's own --- separator + content survive
    });
});
