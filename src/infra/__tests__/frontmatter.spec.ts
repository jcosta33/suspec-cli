import { describe, expect, it } from 'vitest';

import { list_field, parse_frontmatter, scalar_field } from '../frontmatter.ts';

function fields(source: string) {
    const result = parse_frontmatter(source);
    if (!result.ok) throw result.error;
    return result.value.fields;
}

describe('parse_frontmatter', () => {
    it('accepts BOM, CRLF, scalars, quotes, comments, and flat lists', () => {
        const source =
            '\uFEFF---\r\ntype: "task" # kind\r\nid: TASK-1\r\nscope: [AC-001, \'AC-002\']\r\nsource:\r\n  - SPEC-1\r\n---\r\n';
        expect(fields(source)).toEqual({
            type: 'task',
            id: 'TASK-1',
            scope: ['AC-001', 'AC-002'],
            source: ['SPEC-1'],
        });
    });

    it('keeps scalar text as text', () => {
        expect(fields('---\nzero: 0\ntruth: true\nnothing: null\nlabel: TASK-[beta]{one}\n---\n')).toEqual({
            zero: '0',
            truth: 'true',
            nothing: 'null',
            label: 'TASK-[beta]{one}',
        });
    });

    it('handles escaped quotes and commas inside quoted list items', () => {
        expect(fields('---\nname: "a\\"b"\nitems: ["a,b", \'it\'\'s\']\n---\n')).toEqual({
            name: 'a\\"b',
            items: ['a,b', "it''s"],
        });
    });

    it('accepts complete quoted scalars containing nested-syntax and comment markers', () => {
        expect(
            fields(
                '---\ndouble: "Why: now # still text" # comment\nsingle: \'Because: later # still text\' # comment\n---\n'
            )
        ).toEqual({
            double: 'Why: now # still text',
            single: 'Because: later # still text',
        });
    });

    it('accepts consistently indented flat block lists', () => {
        expect(fields('---\nscope:\n   - AC-001\n   - AC-002\n---\n')).toEqual({
            scope: ['AC-001', 'AC-002'],
        });
    });

    it('exposes scalar and list fields without coercion', () => {
        const parsed = fields('---\nid: X\nscope: [AC-001]\n---\n');
        expect(scalar_field(parsed, 'id')).toBe('X');
        expect(scalar_field(parsed, 'scope')).toBeUndefined();
        expect(list_field(parsed, 'scope')).toEqual(['AC-001']);
        expect(list_field(parsed, 'id')).toBeUndefined();
    });

    it.each([
        ['missing opening fence', '# body\n'],
        ['missing closing fence', '---\nid: X\n'],
        ['duplicate key', '---\nid: X\nid: Y\n---\n'],
        ['empty list head', '---\nsource:\nid: X\n---\n'],
        ['nested map', '---\nmeta: { id: X }\n---\n'],
        ['plain nested map', '---\nmeta: id: X\n---\n'],
        ['multiline scalar', '---\nnote: >\n  text\n---\n'],
        ['anchor', '---\nid: &id X\n---\n'],
        ['alias', '---\nid: *id\n---\n'],
        ['tag', '---\nid: !value X\n---\n'],
        ['unbalanced quote', '---\nid: "X\n---\n'],
        ['partial quoted scalar', '---\nid: "X" tail\n---\n'],
        ['embedded scalar quote', '---\nid: X "tail"\n---\n'],
        ['unmatched closing bracket', '---\nid: TASK-x]\n---\n'],
        ['unmatched opening bracket', '---\nid: TASK-x[\n---\n'],
        ['unmatched closing brace', '---\nid: TASK-x}\n---\n'],
        ['unmatched opening brace', '---\nid: TASK-x{\n---\n'],
        ['crossed delimiters', '---\nid: TASK-[x}\n---\n'],
        ['unbalanced list', '---\nscope: [AC-001\n---\n'],
        ['nested list', '---\nscope: [[AC-001]]\n---\n'],
        ['empty inline item', '---\nscope: [AC-001, ]\n---\n'],
        ['unsupported inline item', '---\nscope: [> value]\n---\n'],
        ['empty block item', '---\nscope:\n  - ""\n---\n'],
        ['nested block-list child', '---\nscope:\n  - AC-001\n    - AC-002\n---\n'],
        ['inconsistent block-list indentation', '---\nscope:\n   - AC-001\n  - AC-002\n---\n'],
    ])('rejects %s', (_name, source) => {
        expect(parse_frontmatter(source).ok).toBe(false);
    });
});
