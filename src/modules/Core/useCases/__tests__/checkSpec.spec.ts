import { describe, it, expect } from 'vitest';

import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { check_spec } from '../checkSpec.ts';

const CONFORMANT = `---
type: spec
id: SPEC-ok
title: OK
status: ready
owner: Jane
sources:
  - ADR-0077
---

## Requirements

### AC-001 — the tool rejects bad input
The tool must reject malformed input.
Verify with: a unit test over the parser.

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
The tool must reject malformed input.

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
The tool must reject malformed input. TODO: finalize the error message.
Verify with: a unit test over the parser.

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

    it('returns a warning report when only a warning-level check fires (missing Non-goals)', () => {
        const noNonGoals = CONFORMANT.replace(/## Non-goals\n\n- not redesigning the parser\.\n\n/, '');
        const report = assertOk(check_spec({ source: noNonGoals, path: 'spec.md', exists: () => true }));
        expect(report.level).toBe('warning');
        expect(report.diagnostics.map((d) => d.code)).toContain('C005');
    });

    it('surfaces a parse failure as an Err (maps to exit 2)', () => {
        const failure = assertErr(check_spec({ source: 'no frontmatter here', path: 'spec.md', exists: () => true }));
        expect(failure._tag).toBe('ParseFailure');
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
            '## Requirements',
            '',
            '### AC-001 — the linter flags a marker',
            'The linter must flag a marker like the example.',
            'Verify with: a unit test.',
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

    it('H2: a fenced `## Non-goals` example does not satisfy the C005 presence check', () => {
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
            '## Requirements',
            '',
            '### AC-001 — emits a scaffold',
            'The generator must emit a section example.',
            'Verify with: a snapshot test.',
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
        expect(report.diagnostics.some((d) => d.code === 'C005')).toBe(true);
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
            '## Requirements',
            '',
            '### AC-001 — rejects a deprecated key',
            'The loader must reject a config that sets the `should:` key.',
            'Verify with: a unit test.',
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
