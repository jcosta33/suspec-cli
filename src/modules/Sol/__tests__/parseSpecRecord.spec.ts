import { describe, it, expect } from 'vitest';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { parse_spec_record } from '../useCases/parseSpecRecord.ts';

const SPEC = `---
type: spec
id: SPEC-demo
title: Demo
status: ready
owner: Jane
sources:
  - ADR-0077, ../suspec/docs/adrs/0077.md
  - JIRA-9
---

## Requirements

### The check group

### AC-001 — first
The tool must do X.
Verify with: a test.

### AC-002 — second
The tool should do Y, see [the doc](docs/y.md) and [[WIKI-REF]].
Verify with: another test.

## Non-goals

- not this
- not that

## Open questions

- none
`;

describe('parse_spec_record', () => {
    it('extracts frontmatter scalars and tokenized sources', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.frontmatter.type).toBe('spec');
        expect(record.frontmatter.id).toBe('SPEC-demo');
        expect(record.frontmatter.status).toBe('ready');
        expect(record.frontmatter.format).toBeNull();
        expect(record.frontmatter.sources).toEqual(['ADR-0077', '../suspec/docs/adrs/0077.md', 'JIRA-9']);
        expect(record.frontmatter.supersededBy).toBeNull(); // absent on a living spec — the common case
    });

    it('reads the superseded_by replacement pointer when present (ADR-0108)', () => {
        const source = '---\ntype: spec\nid: SPEC-old\nstatus: superseded\nsuperseded_by: SPEC-new\nsources:\n  - self\n---\n\n## Requirements\n';
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.frontmatter.supersededBy).toBe('SPEC-new');
        expect(record.frontmatter.status).toBe('superseded');
    });

    it('extracts requirements (skipping non-id H3 group headings) with their body', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001', 'AC-002']);
        expect(record.requirements[0].body).toContain('must do X');
        expect(record.requirements[0].body).toContain('Verify with:');
        expect(record.requirements[0].line).toBeGreaterThan(0);
    });

    it('captures section titles, the Non-goals body, and Open-questions presence', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.sectionTitles).toEqual(['Requirements', 'Non-goals', 'Open questions']);
        expect(record.nonGoalsBody).toContain('not this');
        expect(record.openQuestionsPresent).toBe(true);
    });

    it('extracts markdown and wiki links from the body', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        const raws = record.links.map((l) => l.raw);
        expect(raws).toContain('docs/y.md');
        expect(raws).toContain('WIKI-REF');
        expect(record.links.every((l) => l.line > 0)).toBe(true);
    });

    it('marks inline [[KEY]] citations distinctly from markdown links (C015)', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        // The `[[WIKI-REF]]` in AC-002's body is a citation; the `](docs/y.md)` markdown link is not.
        expect(record.citations).toContain('WIKI-REF');
        expect(record.citations).not.toContain('docs/y.md');
    });

    it('citations take the key before any | and dedupe, skipping an empty key', () => {
        const source = `---
type: spec
id: SPEC-cite
status: ready
sources:
  - ../suspec/docs/research/sources.md
---

## Requirements

### AC-001 — cites
Per [[GOOGLESA]] and [[MAST|the MAST taxonomy]], it must hold; see [[GOOGLESA]] again and [[]].
Verify with: a test.

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        // `[[MAST|text]]` keys on MAST (the part before |); `[[GOOGLESA]]` is deduped; `[[]]` is skipped.
        expect(record.citations).toEqual(['GOOGLESA', 'MAST']);
    });

    it('parses inline-array sources', () => {
        const source = `---\ntype: spec\nid: X\nsources: [a.md, b.md]\n---\n\n## Non-goals\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.frontmatter.sources).toEqual(['a.md', 'b.md']);
    });

    it('records format: sol and no requirements when there are none', () => {
        const source = `---\ntype: spec\nid: X\nformat: sol\n---\n\nbody with no headings\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.frontmatter.format).toBe('sol');
        expect(record.requirements).toEqual([]);
        expect(record.openQuestionsPresent).toBe(false);
        expect(record.nonGoalsBody).toBe('');
    });

    it('parses SOL `REQ <ID>:` requirement openers + their VERIFY BY command for format: sol (R4-ISS-01)', () => {
        // Without this a format: sol spec parsed to ZERO requirements, so suspec check returned a false
        // "clean" on any broken SOL spec — the core checks (id/verify/coverage) never saw the requirements.
        const source = `---\ntype: spec\nid: SPEC-led\nstatus: ready\nformat: sol\n---\n\n# Ledger\n\n## Requirements\n\nREQ AC-001:\nWHEN a client POSTs THE service MUST append\nVERIFY BY test:unit:cmdTest:lib#append\n\nREQ AC-002:\nWHEN a client GETs THE service MUST respond\nVERIFY BY test:unit:cmdTest:lib#read\n`;
        const record = assertOk(parse_spec_record({ source, path: 'led.md' }));
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001', 'AC-002']);
        expect(record.requirements[0].verifyCommand).toBe('test:unit:cmdTest:lib#append');
    });

    it('does NOT treat `REQ <ID>:` as a requirement in a non-SOL (plain) spec', () => {
        // The REQ opener is a SOL construct; a stray `REQ AC-001:` line in a plain spec must not parse.
        const source = `---\ntype: spec\nid: X\nstatus: ready\n---\n\n## Requirements\n\nREQ AC-001:\nWHEN a thing THE service MUST do it\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.requirements).toEqual([]);
    });

    it('parses SOL CONSTRAINT (C-) / INVARIANT (I-) / INTERFACE (IF-) openers, not just REQ (R5-I09)', () => {
        // Their ids must parse as requirements so a task can scope C-/I-/IF- and the coverage reconcile
        // does not false-fire orphan / scope≠spec on them. QUESTION (Q-) is intentionally NOT a requirement.
        const source = `---\ntype: spec\nid: SPEC-pol\nstatus: ready\nformat: sol\n---\n\n# Policy\n\n## Requirements\n\nREQ AC-001:\nTHE service MUST authorize\nVERIFY BY test:a\n\nCONSTRAINT C-001:\nTHE store MUST be append-only\nVERIFY BY test:b\n\nINVARIANT I-001:\nTHE balance MUST never go negative\nVERIFY BY test:c\n\nINTERFACE IF-001:\nTHE API MUST expose GET /check\nVERIFY BY test:d\n\nQUESTION Q-001:\nshould retries be capped?\n`;
        const record = assertOk(parse_spec_record({ source, path: 'pol.md' }));
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001', 'C-001', 'I-001', 'IF-001']);
    });

    it('tolerates orphan list lines and blank lines in frontmatter, and absent scalars', () => {
        const source = `---\n  - orphan list line\n\nsources: [only.md]\n---\n\nbody\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.frontmatter.type).toBeNull();
        expect(record.frontmatter.id).toBeNull();
        expect(record.frontmatter.status).toBeNull();
        expect(record.frontmatter.sources).toEqual(['only.md']);
    });

    it('fails when the source has no frontmatter fence', () => {
        const failure = assertErr(parse_spec_record({ source: '# no frontmatter\n', path: 'x.md' }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('fails when the frontmatter fence is never closed', () => {
        const failure = assertErr(parse_spec_record({ source: '---\nid: x\nno closing fence here\n', path: 'x.md' }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('lifts the named Verify command into a discrete field — plain and SOL both resolve to it (AC-003)', () => {
        const source = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — plain form
The tool must do X.
Verify with: npm test -- auth-refresh.spec.ts

### AC-002 — SOL form
The tool must do Y.
VERIFY BY test:cmdTest:signup-empty-email

### AC-003 — no verify line
The tool must do Z, with no check.

### AC-004 — empty verify line
The tool must do W.
Verify with:

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        const byId = new Map(record.requirements.map((r) => [r.id, r.verifyCommand]));
        // The plain `Verify with:` and the SOL `VERIFY BY` both resolve into the same discrete field.
        expect(byId.get('AC-001')).toBe('npm test -- auth-refresh.spec.ts');
        expect(byId.get('AC-002')).toBe('test:cmdTest:signup-empty-email');
        // A requirement with no verify line, and a bare `Verify with:` with nothing after it, read null.
        expect(byId.get('AC-003')).toBeNull();
        expect(byId.get('AC-004')).toBeNull();
    });

    it('parses a CRLF-line-ending spec identically to LF (not falsely "unparseable")', () => {
        const lf = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        const crlf = assertOk(parse_spec_record({ source: SPEC.replace(/\n/g, '\r\n'), path: 'spec.md' }));
        expect(crlf.frontmatter).toEqual(lf.frontmatter);
        expect(crlf.requirements.map((requirement) => requirement.id)).toEqual(lf.requirements.map((r) => r.id));
    });
});

describe('parse_spec_record — fenced examples (#23/#31)', () => {
    it('A2: a `### AC-NNN` inside a code fence is not registered as a real requirement', () => {
        const spec = [
            '---',
            'type: spec',
            'id: SPEC-a2',
            'title: A2',
            'status: ready',
            '---',
            '',
            '## Requirements',
            '',
            '### AC-001 — the real one',
            'It must work.',
            'Verify with: a test.',
            '',
            '## Examples',
            '',
            '```md',
            '### AC-777 — example only',
            'Verify with: `fake`',
            '```',
        ].join('\n');
        const parsed = assertOk(parse_spec_record({ source: spec, path: 'spec.md' }));
        const ids = parsed.requirements.map((r) => r.id);
        expect(ids).toContain('AC-001');
        expect(ids).not.toContain('AC-777');
    });

    it('H1/H2: a fenced `## Non-goals` heading and a fenced TODO are not seen as structure', () => {
        const spec = [
            '---',
            'type: spec',
            'id: SPEC-fenced',
            'title: F',
            'status: ready',
            '---',
            '',
            '## Requirements',
            '',
            '### AC-001 — shows a scaffold',
            'It must emit an example.',
            'Verify with: a test.',
            '',
            '```md',
            '## Non-goals',
            'TODO: fill in',
            '```',
        ].join('\n');
        const parsed = assertOk(parse_spec_record({ source: spec, path: 'spec.md' }));
        expect(parsed.sectionTitles).not.toContain('Non-goals');
        expect(parsed.bodyText.includes('TODO')).toBe(false);
    });
});
