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
  - ADR-0077
  - ../suspec/docs/adrs/0077.md
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
    it('reports the source line for a wrong frontmatter field shape', () => {
        const failure = assertErr(
            parse_spec_record({ source: '---\ntype: [spec]\nid: SPEC-x\n---\n', path: 'spec.md' })
        );
        expect(failure).toMatchObject({ message: 'frontmatter `type:` must be a scalar', line: 2 });
    });

    it('rejects a scalar `sources:` — it must be a list', () => {
        const failure = assertErr(
            parse_spec_record({
                source: '---\ntype: spec\nid: SPEC-x\nsources: ADR-0077\n---\n',
                path: 'spec.md',
            })
        );
        expect(failure).toMatchObject({ message: 'frontmatter `sources:` must be a list', line: 4 });
    });

    it('extracts frontmatter scalars and tokenized sources', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.frontmatter.type).toBe('spec');
        expect(record.frontmatter.id).toBe('SPEC-demo');
        expect(record.frontmatter.status).toBe('ready');
        expect(record.frontmatter.sources).toEqual(['ADR-0077', '../suspec/docs/adrs/0077.md', 'JIRA-9']);
    });

    it.each([
        ['unknown status', SPEC.replace('status: ready', 'status: published'), '`status:` must be draft or ready'],
        ['wrong-case status', SPEC.replace('status: ready', 'status: Ready'), '`status:` must be draft or ready'],
    ])('rejects a present %s option', (_name, source, message) => {
        expect(assertErr(parse_spec_record({ source, path: 'spec.md' })).message).toContain(message);
    });

    it('closes an Intent section at an H1 boundary', () => {
        const source = `---
type: spec
id: SPEC-intent-boundary
status: draft
---

## Intent

# Outside the Intent section

This text must not satisfy Intent.

## Requirements
`;
        expect(assertOk(parse_spec_record({ source, path: 'spec.md' })).intentBody.trim()).toBe('');
    });

    it('keeps H3 subsection content inside Intent', () => {
        const source = `---
type: spec
id: SPEC-intent-subsection
status: draft
---

## Intent

### User outcome

Users finish checkout without duplicate charges.

## Requirements
`;
        expect(assertOk(parse_spec_record({ source, path: 'spec.md' })).intentBody).toContain(
            'Users finish checkout without duplicate charges.'
        );
    });

    it('normalizes quotes and inline comments in source-list items', () => {
        const source = `---
type: spec
id: SPEC-sources
sources:
  - "docs/source.md" # primary
  - 'ADR-0077'
---
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.frontmatter.sources).toEqual(['docs/source.md', 'ADR-0077']);
    });

    it('preserves spaces inside a quoted source path', () => {
        const source = `---
type: spec
id: SPEC-spaced-source
sources: ["missing dir/ticket,one.md"]
---
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.frontmatter.sources).toEqual(['missing dir/ticket,one.md']);
    });

    it('tolerates CRLF line endings and a leading UTF-8 BOM (a BOM-saved spec still parses)', () => {
        const bom =
            '﻿---\r\ntype: spec\r\nid: SPEC-bom\r\nstatus: ready\r\nsources:\r\n  - self\r\n---\r\n\r\n## Requirements\r\n';
        const record = assertOk(parse_spec_record({ source: bom, path: 'spec.md' }));
        expect(record.frontmatter.id).toBe('SPEC-bom');
        expect(record.frontmatter.status).toBe('ready');
    });

    it('extracts requirements (skipping non-id H3 group headings) with their body', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001', 'AC-002']);
        expect(record.requirements[0].body).toContain('must do X');
        expect(record.requirements[0].body).toContain('Verify with:');
        expect(record.requirements[0].line).toBeGreaterThan(0);
    });

    it('does not parse a requirement heading and body inside an HTML comment', () => {
        const source = SPEC.replace(
            '### AC-001 — first\nThe tool must do X.\nVerify with: a test.',
            '<!--\n### AC-001 — first\nThe tool must do X.\nVerify with: a test.\n-->'
        );
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.requirements.map((requirement) => requirement.id)).toEqual(['AC-002']);
    });

    it('captures section titles, the Non-goals body, and Open-questions presence', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        expect(record.sectionTitles).toEqual(['Requirements', 'Non-goals', 'Open questions']);
        expect(record.nonGoalsBody).toContain('not this');
        expect(record.openQuestionsPresent).toBe(true);
    });

    it('keeps Markdown filesystem links separate from wiki citations', () => {
        const record = assertOk(parse_spec_record({ source: SPEC, path: 'spec.md' }));
        const raws = record.links.map((l) => l.raw);
        expect(raws).toContain('docs/y.md');
        expect(raws).not.toContain('WIKI-REF');
        expect(record.links.every((l) => l.line > 0)).toBe(true);
    });

    it('extracts an angle-wrapped Markdown destination containing spaces', () => {
        const source = SPEC.replace('docs/y.md', '<docs/missing ticket.md>');
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.links.map((link) => link.raw)).toContain('docs/missing ticket.md');
    });

    it('parses requirements only inside the Requirements section', () => {
        const source = SPEC.replace(
            '## Requirements\n',
            '## Intent\n\n### AC-999 — example only\nThe tool must not count this.\nVerify with: never.\n\n## Requirements\n'
        );
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.requirements.map((requirement) => requirement.id)).not.toContain('AC-999');
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

    it('captures a lowercase split-suffix heading as malformed, never as a requirement (C019)', () => {
        const source = `---
type: spec
id: SPEC-suffix
status: ready
sources:
  - a.md
---

## Requirements

### AC-001 — real
It must work.
Verify with: a test.

### AC-002a — split half
It must also work.
Verify with: another test.

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001']);
        expect(record.malformedRequirementHeadings).toEqual([{ heading: 'AC-002a', line: 15 }]);
        // The malformed heading still closes AC-001 (the generic-H3 fall-through): the split half's
        // body must not leak into the real requirement.
        expect(record.requirements[0]?.body ?? '').not.toContain('also work');
    });

    it('uppercase-continuation prose headings and fenced examples never register as malformed (C019)', () => {
        const source = `---
type: spec
id: SPEC-prose
status: ready
sources:
  - a.md
---

## Requirements

### AC-001 — real
It must work.
Verify with: a test.

### UTF-16LE handling
Prose about encodings, not a requirement id.

### C-3PO example
More prose.

\`\`\`markdown
### AC-004a — quoted example inside a fence
\`\`\`

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.malformedRequirementHeadings).toEqual([]);
        expect(record.requirements.map((r) => r.id)).toEqual(['AC-001']);
    });

    it('captures the whole malformed token, underscore continuation included (C019)', () => {
        const source = `---
type: spec
id: SPEC-underscore
status: ready
sources:
  - a.md
---

## Requirements

### AC-004a_note — split half with a tail
It must work.
Verify with: a test.

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.malformedRequirementHeadings.map((m) => m.heading)).toEqual(['AC-004a_note']);
    });

    it('a [[KEY]] or ](path) inside a fence or inline code is example text, never a live citation/link', () => {
        const source = `---
type: spec
id: SPEC-fenced
status: ready
sources:
  - a.md
---

## Requirements

### AC-001 — documents the syntax
The doc shows the citation form in an example:
\`\`\`
Cite like [[FENCED-KEY]] and link like [text](fenced/path.md).
\`\`\`
And inline: \`[[INLINE-KEY]]\` is the shape. A real one: [[REAL-KEY]].
Verify with: a test.

## Non-goals

- none
`;
        const record = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(record.citations).toEqual(['REAL-KEY']);
        const raws = record.links.map((l) => l.raw);
        expect(raws).not.toContain('fenced/path.md');
        expect(raws).not.toContain('FENCED-KEY');
        expect(raws).not.toContain('INLINE-KEY');
    });

    it('parses inline-array sources', () => {
        const source = `---\ntype: spec\nid: X\nsources: [a.md, b.md]\n---\n\n## Non-goals\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.frontmatter.sources).toEqual(['a.md', 'b.md']);
    });

    it('does NOT treat `REQ <ID>:` as a requirement in a non-SOL (plain) spec', () => {
        // The REQ opener is a SOL construct; a stray `REQ AC-001:` line in a plain spec must not parse.
        const source = `---\ntype: spec\nid: X\nstatus: ready\n---\n\n## Requirements\n\nREQ AC-001:\nWHEN a thing THE service MUST do it\n`;
        const record = assertOk(parse_spec_record({ source, path: 'x.md' }));
        expect(record.requirements).toEqual([]);
    });

    it('rejects orphan list lines in frontmatter', () => {
        const source = `---\n  - orphan list line\n\nsources: [only.md]\n---\n\nbody\n`;
        expect(assertErr(parse_spec_record({ source, path: 'x.md' }))._tag).toBe('ParseFailure');
    });

    it('fails when the source has no frontmatter fence', () => {
        const failure = assertErr(parse_spec_record({ source: '# no frontmatter\n', path: 'x.md' }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('fails when the frontmatter fence is never closed', () => {
        const failure = assertErr(parse_spec_record({ source: '---\nid: x\nno closing fence here\n', path: 'x.md' }));
        expect(failure._tag).toBe('ParseFailure');
    });

    it('lifts the named Verify command into a discrete field (AC-003)', () => {
        const source = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — plain form
The tool must do X.
Verify with: npm test -- auth-refresh.spec.ts

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
        // A named `Verify with:` line resolves into the same discrete field as the requirement.
        expect(byId.get('AC-001')).toBe('npm test -- auth-refresh.spec.ts');
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
    it('does not enter fence state for a backtick opener with a backtick in its info string', () => {
        const source = SPEC.replace(
            '### AC-002 — second',
            '```markdown `invalid`\n### AC-099 — visible because the opener is invalid\nThe tool must expose it.\nVerify with: a test.\n```\n\n### AC-002 — second'
        );
        const parsed = assertOk(parse_spec_record({ source, path: 'spec.md' }));
        expect(parsed.requirements.map((requirement) => requirement.id)).toContain('AC-099');
    });

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
