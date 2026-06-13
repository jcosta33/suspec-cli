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
  - ADR-0077, ../swarm/docs/adrs/0077.md
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
        expect(record.frontmatter.sources).toEqual(['ADR-0077', '../swarm/docs/adrs/0077.md', 'JIRA-9']);
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
});
