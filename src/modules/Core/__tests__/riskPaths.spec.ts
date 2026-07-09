import { describe, it, expect } from 'vitest';

import { match_risk_paths, parse_risk_paths, risk_nudge_line } from '../services/riskPaths.ts';

// SPEC-suspec-v2 AC-022: the pure half of the risk-path nudge — the config parse, the glob match
// against a changed-file list, and the one-line advisory renderer.

describe('parse_risk_paths', () => {
    it('reads a list of non-empty strings', () => {
        expect(parse_risk_paths({ risk_paths: ['src/auth/**', 'migrations/*.sql'] })).toEqual([
            'src/auth/**',
            'migrations/*.sql',
        ]);
    });

    it('degrades every non-list / non-string shape to empty (absence of config is never an error)', () => {
        expect(parse_risk_paths(null)).toEqual([]);
        expect(parse_risk_paths('src/auth')).toEqual([]);
        expect(parse_risk_paths({})).toEqual([]);
        expect(parse_risk_paths({ risk_paths: 'src/auth' })).toEqual([]);
        expect(parse_risk_paths({ risk_paths: [42, '', '  ', 'src/auth'] })).toEqual(['src/auth']);
    });
});

describe('match_risk_paths', () => {
    it('`**` crosses directories; `*` stays within one segment', () => {
        const files = ['src/auth/token.ts', 'src/auth/deep/nest.ts', 'src/other.ts', 'migrations/001-init.sql'];
        expect(match_risk_paths(files, ['src/auth/**'])).toEqual(['src/auth/deep/nest.ts', 'src/auth/token.ts']);
        expect(match_risk_paths(files, ['migrations/*.sql'])).toEqual(['migrations/001-init.sql']);
        // one-segment `*` must not cross the slash
        expect(match_risk_paths(['a/b/c.sql'], ['a/*.sql'])).toEqual([]);
    });

    it('`?` matches exactly one non-slash char; regex specials in a glob are literal', () => {
        expect(match_risk_paths(['v1.ts', 'v22.ts', 'v/x'], ['v?.ts'])).toEqual(['v1.ts']);
        expect(match_risk_paths(['a+b.ts', 'axb.ts'], ['a+b.ts'])).toEqual(['a+b.ts']);
    });

    it('a wildcard-less pattern uses containment: itself, or anything beneath it as a directory', () => {
        const files = ['src/auth', 'src/auth/token.ts', 'src/authx/no.ts'];
        expect(match_risk_paths(files, ['src/auth'])).toEqual(['src/auth', 'src/auth/token.ts']);
        expect(match_risk_paths(files, ['src/auth/'])).toEqual(['src/auth', 'src/auth/token.ts']);
    });

    it('empty inputs and no-match both read as no matched paths, de-duplicated + sorted otherwise', () => {
        expect(match_risk_paths([], ['src/**'])).toEqual([]);
        expect(match_risk_paths(['a.ts'], [])).toEqual([]);
        expect(match_risk_paths(['a.ts'], ['b/**'])).toEqual([]);
        expect(match_risk_paths(['b/z.ts', 'b/a.ts'], ['b/**', 'b/*'])).toEqual(['b/a.ts', 'b/z.ts']);
    });
});

describe('risk_nudge_line', () => {
    it('renders the one advisory line naming the matched paths', () => {
        const line = risk_nudge_line(['src/auth/token.ts']);
        expect(line).toContain('risk path');
        expect(line).toContain('src/auth/token.ts');
        expect(line).toContain('advisory');
    });

    it('is silent (null) when nothing matched', () => {
        expect(risk_nudge_line([])).toBeNull();
    });
});
