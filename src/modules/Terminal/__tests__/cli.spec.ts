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

    it('a string flag with no following value is dropped; unknown flags are ignored', () => {
        const { positional, flags } = parse_flags(['--from', '--unknown', 'pos'], SPEC);
        // --from has no value (next is a flag) → not set; --unknown ignored; pos stays positional
        expect(flags.has('from')).toBe(false);
        expect(positional).toEqual(['pos']);
    });
});
