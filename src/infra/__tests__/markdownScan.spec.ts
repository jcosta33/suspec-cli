import { describe, it, expect } from 'vitest';

import { scan_markdown, strip_inline_code, visible_text } from '../markdownScan.ts';

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
