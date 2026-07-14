import { describe, it, expect } from 'vitest';

import { parse_flags } from '../useCases/cli.ts';

const SPEC = { booleans: ['--json', '-i', '--force'], strings: ['--from', '--scope'] };

describe('parse_flags', () => {
    it('separates positionals from boolean and string flags', () => {
        const { positional, flags } = parse_flags(['task', '--from', 'SPEC-x', '--json'], SPEC);
        expect(positional).toEqual(['task']);
        expect(flags.get('from')).toBe('SPEC-x');
        expect(flags.get('json')).toBe(true);
    });

    it('treats every token after a bare `--` as positional, even a dash-leading one (#25)', () => {
        const { positional, flags } = parse_flags(['run', '--', '--base', '-x'], SPEC);
        expect(positional).toEqual(['run', '--base', '-x']);
        expect(flags.size).toBe(0);
    });

    it('a boolean flag never swallows the following positional', () => {
        const { positional, flags } = parse_flags(['--json', 'spec.md'], SPEC);
        expect(flags.get('json')).toBe(true);
        expect(positional).toEqual(['spec.md']);
    });

    it('supports --key=value and strips leading dashes from keys', () => {
        const { flags } = parse_flags(['--from=SPEC-y', '-i'], SPEC);
        expect(flags.get('from')).toBe('SPEC-y');
        expect(flags.get('i')).toBe(true);
    });

    it.each([
        ['terminal flag', ['task', '--from']],
        ['another declared option', ['task', '--from', '--force']],
        ['help option', ['task', '--from', '--help']],
        ['empty assigned value', ['task', '--from=']],
    ])('reports a missing string value for a %s', (_name, argv) => {
        const parsed = parse_flags(argv, SPEC);
        expect(parsed.flags.has('from')).toBe(false);
        expect(parsed.errors).toContain('option --from requires a value');
    });

    it('coerces a declared boolean in --flag=value form; a string flag keeps its value', () => {
        expect(parse_flags(['--json=true'], SPEC).flags.get('json')).toBe(true);
        expect(parse_flags(['--json=false'], SPEC).flags.get('json')).toBe(false);
        expect(parse_flags(['--from=SPEC-z'], SPEC).flags.get('from')).toBe('SPEC-z');
    });

    it('rejects any other assigned boolean value', () => {
        const parsed = parse_flags(['--json=typo'], SPEC);
        expect(parsed.flags.has('json')).toBe(false);
        expect(parsed.errors).toContain('option --json accepts only true or false');
    });

    it('reports standalone and assigned undeclared flags without treating them as positionals', () => {
        const { positional, flags, unknown } = parse_flags(['spec.md', '--bogus', '--tsak=task.md', 'task.md'], SPEC);
        expect(positional).toEqual(['spec.md', 'task.md']);
        expect(flags.size).toBe(0);
        expect(unknown).toEqual(['--bogus', '--tsak=task.md']);
    });
});
