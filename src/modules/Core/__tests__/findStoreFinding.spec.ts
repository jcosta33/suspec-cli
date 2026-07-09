import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { find_store_finding } from '../useCases/findStoreFinding.ts';

// SPEC-suspec-v2 AC-016/AC-017: the finding lookup `promote` and `fix` share — id or filename,
// root by default, archive/ on request, traversal-proof by construction.

let store: string;

const FINDING = `---
type: finding
id: FIND-007
run: feat
severity: normal
affected_areas:
  - src/auth
---

# The token refresh races

details here
`;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-find-'));
    writeFileSync(join(store, 'finding-007.md'), FINDING);
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('find_store_finding — id / filename resolution', () => {
    it('resolves by frontmatter id with title, run, severity, affected areas, and the stripped body lifted', () => {
        const found = find_store_finding(store, 'FIND-007');
        expect(found).not.toBeNull();
        expect(found).toMatchObject({
            filename: 'finding-007.md',
            id: 'FIND-007',
            title: 'The token refresh races',
            run: 'feat',
            severity: 'normal',
            affectedAreas: ['src/auth'],
            archived: false,
        });
        expect(found?.body).toBe('# The token refresh races\n\ndetails here'); // frontmatter stripped
    });

    it('body: an unterminated frontmatter fence keeps the whole source (never guess a cut)', () => {
        writeFileSync(join(store, 'finding-021.md'), '---\ntype: finding\nid: FIND-021\nno close\n');
        expect(find_store_finding(store, 'FIND-021')?.body).toBe('---\ntype: finding\nid: FIND-021\nno close');
    });

    it('resolves by filename, with and without the .md extension', () => {
        expect(find_store_finding(store, 'finding-007.md')?.id).toBe('FIND-007');
        expect(find_store_finding(store, 'finding-007')?.id).toBe('FIND-007');
    });

    it('null for an unknown ref, a missing store dir, and a non-finding artifact', () => {
        expect(find_store_finding(store, 'FIND-999')).toBeNull();
        expect(find_store_finding(join(store, 'nope'), 'FIND-007')).toBeNull();
        writeFileSync(join(store, 'finding-spec.md'), '---\ntype: spec\nid: FIND-XXX\n---\n');
        expect(find_store_finding(store, 'FIND-XXX')).toBeNull();
    });

    it('skips a dir masquerading as finding-*.md', () => {
        mkdirSync(join(store, 'finding-dir.md'));
        expect(find_store_finding(store, 'finding-dir.md')).toBeNull();
    });

    it('a finding without an id/heading falls back to null id + filename title', () => {
        writeFileSync(join(store, 'finding-008.md'), '---\ntype: finding\n---\n\nno heading\n');
        const found = find_store_finding(store, 'finding-008.md');
        expect(found?.id).toBeNull();
        expect(found?.title).toBe('finding-008.md');
        expect(found?.affectedAreas).toEqual([]);
    });

    it('scans archive/ only when includeArchived is set, flagging the hit as archived', () => {
        mkdirSync(join(store, 'archive'));
        writeFileSync(join(store, 'archive', 'finding-042.md'), FINDING.replace('FIND-007', 'FIND-042'));
        expect(find_store_finding(store, 'FIND-042')).toBeNull();
        const archived = find_store_finding(store, 'FIND-042', { includeArchived: true });
        expect(archived?.archived).toBe(true);
        expect(archived?.filename).toBe('finding-042.md');
        // An open namesake wins over the archived copy.
        expect(find_store_finding(store, 'FIND-007', { includeArchived: true })?.archived).toBe(false);
    });

    it('an unreadable dir (a FILE named archive) reads as no match, never a throw', () => {
        writeFileSync(join(store, 'archive'), 'not a dir');
        expect(find_store_finding(store, 'FIND-042', { includeArchived: true })).toBeNull();
    });

    it('a scalar affected_areas value widens to a one-element list', () => {
        writeFileSync(
            join(store, 'finding-009.md'),
            '---\ntype: finding\nid: FIND-009\naffected_areas: src/solo\n---\n\n# One\n'
        );
        expect(find_store_finding(store, 'FIND-009')?.affectedAreas).toEqual(['src/solo']);
    });
});
