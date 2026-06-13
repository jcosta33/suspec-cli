import { describe, it, expect } from 'vitest';

import { merge_marker_block, has_marker_block } from '../services/markerBlock.ts';

const START = '# >>> swarm >>>';
const END = '# <<< swarm <<<';
const merge = (existing: string, block = 'node_modules/\n.swarm-cache/') =>
    merge_marker_block({ existing, block, startMarker: START, endMarker: END });

describe('merge_marker_block', () => {
    it('returns just the managed block for empty input', () => {
        expect(merge('')).toBe(`${START}\nnode_modules/\n.swarm-cache/\n${END}\n`);
        expect(merge('   \n')).toBe(`${START}\nnode_modules/\n.swarm-cache/\n${END}\n`);
    });

    it('appends after existing content, preserving the user lines', () => {
        const out = merge('dist/\n');
        expect(out.startsWith('dist/\n')).toBe(true);
        expect(out).toContain(`${START}\nnode_modules/\n.swarm-cache/\n${END}\n`);
    });

    it('appends a newline when the existing file lacks a trailing one', () => {
        expect(merge('dist/')).toBe(`dist/\n\n${START}\nnode_modules/\n.swarm-cache/\n${END}\n`);
    });

    it('replaces an existing managed block in place and is idempotent', () => {
        const first = merge('dist/\n');
        const second = merge(first);
        expect(second).toBe(first);

        const updated = merge_marker_block({ existing: first, block: 'CHANGED/', startMarker: START, endMarker: END });
        expect(updated).toContain(`${START}\nCHANGED/\n${END}`);
        expect(updated).not.toContain('node_modules/');
        expect(updated.startsWith('dist/\n')).toBe(true);
    });
});

describe('has_marker_block', () => {
    it('detects the managed block by its start marker', () => {
        expect(has_marker_block(merge('dist/\n'), START)).toBe(true);
        expect(has_marker_block('dist/\n', START)).toBe(false);
    });
});
