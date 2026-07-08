import { describe, it, expect } from 'vitest';

import {
    CURRENT_GRAMMAR_VERSION,
    GRAMMAR_MIGRATIONS,
    read_grammar_version,
    ensure_grammar_version,
    stamp_grammar_version,
} from '../services/grammarVersion.ts';

// AC-003 (SPEC-suspec-v2): the grammar-version service — read, inject-when-absent, force-stamp.
// The transform table is empty while version 1 is the only grammar.

describe('read_grammar_version', () => {
    it('reads a recorded numeric version', () => {
        expect(read_grammar_version('---\ntype: spec\ngrammar_version: 1\n---\nbody\n')).toBe(1);
    });

    it('returns null when no version is recorded', () => {
        expect(read_grammar_version('---\ntype: spec\n---\nbody\n')).toBeNull();
        expect(read_grammar_version('no frontmatter at all\n')).toBeNull();
    });

    it('returns null for a non-numeric version', () => {
        expect(read_grammar_version('---\ngrammar_version: soon\n---\n')).toBeNull();
    });
});

describe('ensure_grammar_version (the write-path injection)', () => {
    it('injects the current version into frontmatter that lacks it, preserving the body', () => {
        const out = ensure_grammar_version('---\ntype: run\n---\n\n# Run\n');
        expect(read_grammar_version(out)).toBe(CURRENT_GRAMMAR_VERSION);
        expect(out).toContain('type: run');
        expect(out).toContain('# Run\n');
    });

    it('prepends a frontmatter block when the content has none', () => {
        const out = ensure_grammar_version('# Just a body\n');
        expect(out.startsWith(`---\ngrammar_version: ${CURRENT_GRAMMAR_VERSION}\n---\n`)).toBe(true);
        expect(out).toContain('# Just a body\n');
    });

    it('never touches a recorded version', () => {
        const source = '---\ngrammar_version: 1\n---\nbody\n';
        expect(ensure_grammar_version(source, 5)).toBe(source);
    });

    it('leaves an unterminated fence alone (malformed is a lint finding, not a guess)', () => {
        const source = '---\ntype: spec\nno closing fence\n';
        expect(ensure_grammar_version(source)).toBe(source);
    });
});

describe('stamp_grammar_version (the migration stamp)', () => {
    it('overwrites a recorded version in place', () => {
        const out = stamp_grammar_version('---\ngrammar_version: 1\ntype: spec\n---\nbody\n', 2);
        expect(read_grammar_version(out)).toBe(2);
        expect(out).toContain('type: spec');
    });

    it('prepends a block when the content has no frontmatter', () => {
        expect(stamp_grammar_version('body only\n', 3).startsWith('---\ngrammar_version: 3\n---\n')).toBe(true);
    });

    it('tolerates a BOM before the fence', () => {
        const out = stamp_grammar_version('﻿---\ntype: spec\n---\nbody\n', 1);
        expect(read_grammar_version(out)).toBe(1);
    });
});

describe('the grammar constants', () => {
    it('version 1 is the first and current grammar; the transform table is empty', () => {
        expect(CURRENT_GRAMMAR_VERSION).toBe(1);
        expect(Object.keys(GRAMMAR_MIGRATIONS)).toHaveLength(0);
    });
});
