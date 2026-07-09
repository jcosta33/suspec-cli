import { describe, it, expect } from 'vitest';

import { spec_requires_runtime } from '../services/specRuntimeNeeds.ts';

// SPEC-suspec-v2 AC-005's blocking heuristic: a spec "needs runtime" when at least one AC's
// `Verify with:` clause names a runtime command — a backtick-quoted command or the word
// test/tests/pnpm/npm/cargo/pip/run.

const spec = (verify: string): string =>
    `---\ntype: spec\nid: SPEC-x\n---\n\n### AC-001 — one\nThe tool must do it.\nVerify with: ${verify}\n\n## Non-goals\n`;

describe('spec_requires_runtime (AC-005)', () => {
    it('fires on a backtick-quoted command in a Verify clause', () => {
        expect(spec_requires_runtime(spec('running `suspec work` against a fixture.'))).toBe(true);
    });

    it.each([
        'a test.',
        'tests — default resolution.',
        'pnpm typecheck passing.',
        'npm ci succeeding.',
        'cargo build.',
        'pip freezing.',
        'a dry run of the loop.',
    ])('fires on the runtime word in %j', (verify) => {
        expect(spec_requires_runtime(spec(verify))).toBe(true);
    });

    it('stays quiet when no Verify clause names a runtime command', () => {
        expect(spec_requires_runtime(spec('reading the rendered doc aloud with the owner.'))).toBe(false);
        // Runtime words OUTSIDE a Verify clause do not count.
        expect(
            spec_requires_runtime(
                '---\nid: S\n---\n\nThe test suite is described here.\n\n### AC-001\nDo.\nVerify with: careful reading.\n\nend.\n'
            )
        ).toBe(false);
        // A word CONTAINING a runtime word does not fire (\b-guarded: "pnpm" inside "npm" etc.).
        expect(spec_requires_runtime(spec('the attestation document, manually.'))).toBe(false);
    });

    it('reads a wrapped Verify clause up to the blank line — and one ending at EOF', () => {
        const wrapped = `---\nid: S\n---\n\n### AC-001\nDo.\nVerify with: a careful reading of the doc,\nthen \`pnpm lint\` on the sample.\n\nend.\n`;
        expect(spec_requires_runtime(wrapped)).toBe(true);
        const atEof = `---\nid: S\n---\n\n### AC-001\nDo.\nVerify with: reading,\nthen the suite of tests`;
        expect(spec_requires_runtime(atEof)).toBe(true);
    });
});
