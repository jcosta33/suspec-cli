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

    it('a string flag consumes the next token even when it looks like a flag (POSIX), no silent drop', () => {
        const captured = parse_flags(['--from', '--unknown', 'pos'], SPEC);
        expect(captured.flags.get('from')).toBe('--unknown'); // captured, not dropped (the command validates it)
        expect(captured.positional).toEqual(['pos']);
        // a string flag at the very end of argv has no value to consume
        const dangling = parse_flags(['task', '--from'], SPEC);
        expect(dangling.flags.has('from')).toBe(false);
        expect(dangling.positional).toEqual(['task']);
    });

    it('coerces a declared boolean in --flag=value form; a string flag keeps its value', () => {
        expect(parse_flags(['--json=true'], SPEC).flags.get('json')).toBe(true);
        expect(parse_flags(['--json=false'], SPEC).flags.get('json')).toBe(false);
        expect(parse_flags(['--from=SPEC-z'], SPEC).flags.get('from')).toBe('SPEC-z');
    });

    it('a standalone undeclared flag is dropped — never a positional, never a flag (a typo is ignored)', () => {
        const { positional, flags } = parse_flags(['spec.md', '--bogus', '--tsak', 'task.md'], SPEC);
        expect(positional).toEqual(['spec.md', 'task.md']);
        expect(flags.size).toBe(0);
    });
});
