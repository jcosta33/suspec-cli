import { describe, it, expect } from 'vitest';

import { atx_heading, atx_heading_level, scan_markdown, strip_inline_code, visible_text } from '../markdownScan.ts';

describe('atx_heading_level', () => {
    it('recognizes CommonMark ATX heading levels without accepting deep indentation or glued hashes', () => {
        expect(atx_heading_level('# one')).toBe(1);
        expect(atx_heading_level('   ### three')).toBe(3);
        expect(atx_heading_level('###### six')).toBe(6);
        expect(atx_heading_level('    ## code')).toBeNull();
        expect(atx_heading_level('##glued')).toBeNull();
        expect(atx_heading_level('plain')).toBeNull();
    });

    it('returns a normalized title for indented headings with optional closing hashes', () => {
        expect(atx_heading('   ## Intent ##')).toEqual({ level: 2, title: 'Intent' });
        expect(atx_heading('### ###')).toEqual({ level: 3, title: '' });
        expect(atx_heading('## literal###')).toEqual({ level: 2, title: 'literal###' });
    });
});

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

    it('rejects a backtick fence opener whose info string contains a backtick', () => {
        const s = scan_markdown(['```md `invalid`', '## visible', '```']);
        expect(s[0]).toMatchObject({ inFence: false, opensFence: false });
        expect(s[1]).toMatchObject({ text: '## visible', inFence: false });
    });

    it('keeps tilde fence info strings containing backticks valid', () => {
        const s = scan_markdown(['~~~md `valid`', '## fenced', '~~~', '## visible']);
        expect(s.map((line) => line.inFence)).toEqual([true, true, true, false]);
        expect(s[0]).toMatchObject({ opensFence: true, fenceInfo: 'md `valid`' });
    });

    it('treats HTML comments as inert while preserving visible text around them', () => {
        const s = scan_markdown([
            'before <!-- hidden --> after',
            '<!--',
            '## Hidden heading',
            '```',
            '-->',
            '## Vis<!-- split -->ible',
        ]);
        expect(s.map((line) => line.text)).toEqual(['before  after', '', '', '', '', '## Visible']);
        expect(s.every((line) => !line.inFence)).toBe(true);
        expect(visible_text(s)).toContain('before  after');
        expect(visible_text(s)).toContain('## Visible');
        expect(visible_text(s)).not.toContain('Hidden heading');
    });

    it('keeps HTML comment markers verbatim inside backtick and tilde fences', () => {
        const s = scan_markdown(['```text', '<!-- TODO -->', '```', '~~~text', '<!-- TBD -->', '~~~']);
        expect(s.map((line) => line.inFence)).toEqual([true, true, true, true, true, true]);
        expect(s[1].text).toBe('<!-- TODO -->');
        expect(s[4].text).toBe('<!-- TBD -->');
    });

    it('does not open an HTML comment from a marker inside inline code', () => {
        const s = scan_markdown(['`<!--` remains literal', '## Visible']);
        expect(visible_text(s)).toBe('       remains literal\n## Visible');
    });

    it('accepts up to three leading spaces and rejects deeper indentation', () => {
        const s = scan_markdown(['   ```', 'inside', '    ```', 'still inside', '   ```', 'outside']);
        expect(s.map((l) => l.inFence)).toEqual([true, true, true, true, true, false]);

        const indented = scan_markdown(['    ```', 'plain']);
        expect(indented.map((l) => l.inFence)).toEqual([false, false]);
    });

    it('recognizes fences nested under unordered and ordered list containers', () => {
        const unordered = scan_markdown(['- Example:', '', '    ~~~text', '    TODO', '    ~~~', 'after']);
        expect(unordered.map((line) => line.inFence)).toEqual([false, false, true, true, true, false]);

        const ordered = scan_markdown(['10. ```text', '    TODO', '    ```']);
        expect(ordered.map((line) => line.inFence)).toEqual([true, true, true]);
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

    it('drops tilde-fenced and HTML-commented text', () => {
        const s = scan_markdown(['visible', '~~~text', 'TODO fenced', '~~~', '<!-- TODO commented -->', 'tail']);
        expect(visible_text(s)).toBe('visible\n\ntail');
    });
});
