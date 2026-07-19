import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { check_spec } from '../checkSpec.ts';
import { resolve_canon_root } from '../../testing/resolveCanonRoot.ts';

const CONFORMANT = `---
type: spec
id: SPEC-ok
title: OK
status: ready
owner: Jane
sources:
  - ADR-0077
---

## Intent

Reject malformed input.

## Requirements

### AC-001 — the tool rejects bad input
- When: input is malformed
- Then: the tool MUST reject it
- Verify with: a unit test over the parser

## Non-goals

- not redesigning the parser.

## Open questions

- none
`;

const MISSING_VERIFY = `---
type: spec
id: SPEC-bad
title: Bad
status: ready
owner: Jane
sources:
  - ADR-0077
---

## Requirements

### AC-001 — the tool rejects bad input
- When: input is malformed
- Then: the tool MUST reject it
- Verify with:

## Non-goals

- nope.

## Open questions

- none
`;

const QUOTED_STATUS_WITH_TBD = `---
type: spec
id: SPEC-q
title: Quoted
status: "ready"
owner: Jane
sources:
  - ADR-0077
---

## Requirements

### AC-001 — the tool rejects bad input
- When: input is malformed
- Then: the tool MUST reject it; TODO: finalize the error message
- Verify with: a unit test over the parser

## Non-goals

- nope.

## Open questions

- none
`;

describe('check_spec', () => {
    it('dequotes a quoted `status: "ready"` so the C007 TBD guard is not suppressed (#38)', () => {
        const report = assertOk(check_spec({ source: QUOTED_STATUS_WITH_TBD, path: 'spec.md', exists: () => true }));
        expect(report.level).toBe('blocking');
        expect(report.diagnostics.some((d) => d.code === 'C007')).toBe(true);
    });

    it('returns a clean report for a conformant spec', () => {
        const report = assertOk(check_spec({ source: CONFORMANT, path: 'spec.md', exists: () => true }));
        expect(report.level).toBe('clean');
        expect(report.diagnostics).toEqual([]);
        expect(report.path).toBe('spec.md');
    });

    it('returns a blocking report naming C003 when a requirement has no Verify line', () => {
        const report = assertOk(check_spec({ source: MISSING_VERIFY, path: 'spec.md', exists: () => true }));
        expect(report.level).toBe('blocking');
        expect(report.diagnostics.map((d) => d.code)).toContain('C003');
    });

    it('checks three-space-indented requirements and normalizes closing hashes on sections', () => {
        const source = CONFORMANT.replace('## Intent', '   ## Intent ##')
            .replace('### AC-001', '   ### AC-001')
            .replace('- Verify with: a unit test over the parser\n', '- Verify with:\n');
        const report = assertOk(check_spec({ source, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C003');
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('C021');
    });

    it('accepts the minimal Intent + Requirements shape without optional sections', () => {
        const minimal = CONFORMANT.replace(/## Non-goals[\s\S]*$/, '');
        const report = assertOk(check_spec({ source: minimal, path: 'spec.md', exists: () => true }));
        expect(report.level).toBe('clean');
        expect(report.diagnostics).toEqual([]);
    });

    it('surfaces a parse failure as an Err (maps to exit 2)', () => {
        const failure = assertErr(check_spec({ source: 'no frontmatter here', path: 'spec.md', exists: () => true }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('does not let a commented Intent heading or body satisfy C021', () => {
        const commented = CONFORMANT.replace(
            '## Intent\n\nReject malformed input.',
            '<!--\n## Intent\n\nReject malformed input.\n-->'
        );
        const report = assertOk(check_spec({ source: commented, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C021');
    });

    it('reports C009 for a missing quoted source path containing spaces', () => {
        const source = CONFORMANT.replace('  - ADR-0077', '  - "missing dir/ticket.md"');
        const report = assertOk(check_spec({ source, path: 'spec.md', exists: () => false }));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C009');
    });

    it('reports C007 for an ordered-list blocking question', () => {
        const source = CONFORMANT.replace('- none', '1. Blocking: Which API should be used?');
        const report = assertOk(check_spec({ source, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain('C007');
    });

    it('ignores unresolved markers inside a list-nested fence', () => {
        const source = CONFORMANT.replace(
            '## Open questions\n\n- none',
            '## Open questions\n\n- Example:\n\n    ~~~text\n    TODO is literal output\n    ~~~'
        );
        const report = assertOk(check_spec({ source, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain('C007');
    });
});

describe('check_spec — markdown structure (#31/#23)', () => {
    it('H1: a TODO inside a code fence does not trip C007 at status: ready', () => {
        const spec = [
            '---',
            'type: spec',
            'id: SPEC-h1',
            'title: H1',
            'status: ready',
            'owner: Jane',
            'sources:',
            '  - ADR-0077',
            '---',
            '',
            '## Intent',
            'Exercise fenced content.',
            '',
            '## Requirements',
            '',
            '### AC-001 — the linter flags a marker',
            '- When: a marker appears',
            '- Then: the linter MUST flag it',
            '- Verify with: a unit test',
            '```js',
            '// TODO: revisit',
            '```',
            '',
            '## Non-goals',
            '- none.',
            '',
            '## Open questions',
            '- none',
        ].join('\n');
        const report = assertOk(check_spec({ source: spec, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.some((d) => d.code === 'C007')).toBe(false);
        expect(report.level).toBe('clean');
    });

    it('H2: a fenced `## Non-goals` example remains inert now that the section is optional', () => {
        const spec = [
            '---',
            'type: spec',
            'id: SPEC-h2',
            'title: H2',
            'status: ready',
            'owner: Jane',
            'sources:',
            '  - ADR-0077',
            '---',
            '',
            '## Intent',
            'Exercise fenced headings.',
            '',
            '## Requirements',
            '',
            '### AC-001 — emits a scaffold',
            '- When: documentation is generated',
            '- Then: the generator MUST emit a section example',
            '- Verify with: a snapshot test',
            '```md',
            '## Non-goals',
            '',
            '- placeholder',
            '```',
            '',
            '## Open questions',
            '- none',
        ].join('\n');
        const report = assertOk(check_spec({ source: spec, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics).toEqual([]);
        expect(report.level).toBe('clean');
    });

    it('H3: a strength word inside an inline-code span is not counted by C004', () => {
        const spec = [
            '---',
            'type: spec',
            'id: SPEC-h3',
            'title: H3',
            'status: ready',
            'owner: Jane',
            'sources:',
            '  - ADR-0077',
            '---',
            '',
            '## Intent',
            'Exercise inline code.',
            '',
            '## Requirements',
            '',
            '### AC-001 — rejects a deprecated key',
            '- When: a config sets the `should:` key',
            '- Then: the loader MUST reject it',
            '- Verify with: a unit test',
            '',
            '## Non-goals',
            '- none.',
            '',
            '## Open questions',
            '- none',
        ].join('\n');
        const report = assertOk(check_spec({ source: spec, path: 'spec.md', exists: () => true }));
        expect(report.diagnostics.some((d) => d.code === 'C004')).toBe(false);
        expect(report.level).toBe('clean');
    });
});

// The frozen payment-5xx fixture is the oracle for C007's blocking-open-question clause — its
// EXPECTED.md pins "C007 fires" on `spec.md` with every other core check passing. Reached the
// same way the contract drift-guard reaches the sibling suspec canon (resolve_canon_root:
// SUSPEC_CANON, `../suspec`, or any canon-shaped sibling). CONDITIONAL on that checkout: in a
// hermetic suspec-cli-only checkout the fixture isn't on disk, so this oracle CANNOT run and
// no-ops (SKIPPED below, never silently green). We deliberately do NOT vendor a fixture copy
// here (a second source of truth would drift from the canon it pins).
describe('check_spec reproduces the payment-5xx fixture (C007 blocking open question)', () => {
    const canonRoot = resolve_canon_root(process.cwd());
    const fixtureDir = canonRoot === null ? '' : resolve(canonRoot, 'checks/fixtures/payment-5xx');
    const plainPath = fixtureDir === '' ? '' : resolve(fixtureDir, 'spec.md');
    const present = plainPath !== '' && existsSync(plainPath);
    if (!present) {
        console.warn(
            `[no-op] payment-5xx-fixture oracle SKIPPED: no sibling suspec canon found (SUSPEC_CANON / ../suspec / canon-shaped sibling) — provide one for the C007 oracle to bite`
        );
    }
    const fixtureName = present
        ? 'reports exactly one hard C007 — the unresolved blocking question (matches EXPECTED.md)'
        : 'reports exactly one hard C007 — the unresolved blocking question (matches EXPECTED.md) (SKIPPED: no sibling suspec canon)';

    (present ? it : it.skip)(fixtureName, () => {
        const report = assertOk(
            check_spec({ source: readFileSync(plainPath, 'utf8'), path: plainPath, exists: () => true })
        );
        expect(report.diagnostics.map((d) => d.code)).toEqual(['C007']);
        expect(report.diagnostics[0].message).toContain('blocking open question');
        expect(report.level).toBe('blocking');
    });
});
