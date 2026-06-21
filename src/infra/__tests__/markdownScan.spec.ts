import { describe, it, expect } from 'vitest';

import { scan_markdown, strip_inline_code, visible_text, logical_blocks } from '../markdownScan.ts';

describe('scan_markdown', () => {
    it('marks fenced content (and the delimiters) inFence, plain lines not', () => {
        const s = scan_markdown(['plain', '```', 'fenced', '```', 'after']);
        expect(s.map((l) => l.inFence)).toEqual([false, true, true, true, false]);
        expect(s[1].opensFence).toBe(true);
    });

    it('exposes the opening fence info string (so a ```verify block is still readable)', () => {
        const s = scan_markdown(['```verify id=AC-001 cmd="x" result=pass', 'body', '```']);
        expect(s[0].opensFence).toBe(true);
        expect(s[0].fenceInfo).toBe('verify id=AC-001 cmd="x" result=pass');
        expect(s[1].inFence).toBe(true);
    });

    it('does not close on a shorter run and reopens after a real close', () => {
        const s = scan_markdown(['````', '```', 'still fenced', '````', 'out']);
        expect(s.map((l) => l.inFence)).toEqual([true, true, true, true, false]);
    });

    it('handles ~~~ fences', () => {
        const s = scan_markdown(['~~~', 'x', '~~~', 'y']);
        expect(s.map((l) => l.inFence)).toEqual([true, true, true, false]);
    });
});

describe('strip_inline_code', () => {
    it('blanks an inline-code span, length-preserved', () => {
        const out = strip_inline_code('a `code | here` b');
        expect(out).toHaveLength('a `code | here` b'.length);
        expect(out.includes('|')).toBe(false);
        expect(out.startsWith('a ')).toBe(true);
        expect(out.endsWith(' b')).toBe(true);
    });

    it('keeps a backslash-escaped pipe and backtick verbatim (GFM)', () => {
        expect(strip_inline_code('x \\| y')).toBe('x \\| y');
    });

    it('leaves an unclosed backtick run as literal', () => {
        expect(strip_inline_code('a ` b')).toBe('a ` b');
    });

    it('handles a multi-backtick span', () => {
        const out = strip_inline_code('a ``b ` c`` d');
        expect(out.includes('b')).toBe(false);
        expect(out.startsWith('a ')).toBe(true);
        expect(out.endsWith(' d')).toBe(true);
    });
});

describe('visible_text', () => {
    it('drops fenced lines and blanks inline code', () => {
        const s = scan_markdown(['real must here', '```', 'TODO fenced', '```', 'tail `TODO`']);
        const v = visible_text(s);
        expect(v.includes('must')).toBe(true);
        expect(v.includes('TODO fenced')).toBe(false);
        expect(v.includes('TODO')).toBe(false); // the inline-code one is blanked
        expect(v.includes('tail')).toBe(true);
    });
});

describe('logical_blocks', () => {
    it('classifies headings, list items, and paragraphs with their marker + indent (blank-separated)', () => {
        const b = logical_blocks(['## Heading', '', '- one', '', '  * two', '', 'plain paragraph']);
        expect(b.map((x) => x.kind)).toEqual(['heading', 'list-item', 'list-item', 'paragraph']);
        expect(b[0].marker).toBe('##');
        expect(b[1].marker).toBe('-');
        expect(b[2]).toMatchObject({ marker: '*', indent: 2 });
        expect(b[3].text).toBe('plain paragraph');
    });

    it('folds a soft-wrapped list item / paragraph into one logical block (a lazy continuation)', () => {
        const b = logical_blocks(['- changed files: `a`', '  and also `b`,', '  `c`', '- next bullet']);
        expect(b).toHaveLength(2);
        expect(b[0].text).toBe('changed files: `a` and also `b`, `c`');
        expect(b[1].text).toBe('next bullet');
    });

    it('ends a block at a blank line, a new list item, or a heading', () => {
        const b = logical_blocks(['para line', '', '- item', '## Head', 'after']);
        expect(b.map((x) => x.kind)).toEqual(['paragraph', 'list-item', 'heading', 'paragraph']);
        expect(b[0].text).toBe('para line');
    });

    it('excludes fenced content entirely — a fenced `- item` / `## head` is verbatim, not structure', () => {
        const b = logical_blocks(['- real', '```', '- fenced item', '## fenced head', '```', '- real2']);
        expect(b.map((x) => x.text)).toEqual(['real', 'real2']);
        expect(b.every((x) => x.kind === 'list-item')).toBe(true);
    });

    it('records numbered list markers + the block start line', () => {
        const b = logical_blocks(['intro', '1. first', '2) second']);
        expect(b[1]).toMatchObject({ kind: 'list-item', marker: '1.', startLine: 1 });
        expect(b[2]).toMatchObject({ kind: 'list-item', marker: '2)', startLine: 2 });
    });
});
