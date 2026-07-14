import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { build_source_exists, is_local_source_ref } from '../resolveSourcePath.ts';

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'suspec-src-'));
    mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
    mkdirSync(join(root, 'sources'), { recursive: true });
    writeFileSync(join(root, 'specs', 'demo', 'spec.md'), '---\n---\n');
    writeFileSync(join(root, 'specs', 'demo', 'ticket.md'), 'co-located\n'); // beside the spec
    writeFileSync(join(root, 'sources', 'sup-204.md'), 'a distant source document\n'); // two levels up
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('build_source_exists — C009 resolves artifact-relative (ADR-0143 D4)', () => {
    it('resolves a co-located ref and a relative path to a distant one; a bare distant ref is broken', () => {
        const exists = build_source_exists(join(root, 'specs', 'demo', 'spec.md'));
        expect(exists('ticket.md')).toBe(true); // resolves beside the spec
        expect(exists('../../sources/sup-204.md')).toBe(true); // a distant ref written artifact-relative
        expect(exists('sources/sup-204.md')).toBe(false); // NOT resolved against any root — broken
        expect(exists('nope.md')).toBe(false); // exists nowhere → broken
    });

    it('rejects a directory at the referenced artifact path', () => {
        mkdirSync(join(root, 'specs', 'demo', 'directory-source.md'));
        const exists = build_source_exists(join(root, 'specs', 'demo', 'spec.md'));
        expect(exists('directory-source.md')).toBe(false);
    });

    it('rejects absolute references even when they name a file', () => {
        const exists = build_source_exists(join(root, 'specs', 'demo', 'spec.md'));
        expect(exists(join(root, 'sources', 'sup-204.md'))).toBe(false);
        expect(exists('C:\\absolute\\source.md')).toBe(false);
        expect(exists('\\\\server\\share\\source.md')).toBe(false);
        expect(exists('https://example.test/source.md')).toBe(false);
    });

    it('classifies only artifact-relative source references as local', () => {
        expect(is_local_source_ref('../sources/source.md')).toBe(true);
        expect(is_local_source_ref('/absolute/source.md')).toBe(false);
        expect(is_local_source_ref('C:\\absolute\\source.md')).toBe(false);
        expect(is_local_source_ref('\\\\server\\share\\source.md')).toBe(false);
        expect(is_local_source_ref('//server/share/source.md')).toBe(false);
        expect(is_local_source_ref('file:///tmp/source.md')).toBe(false);
        expect(is_local_source_ref('https://example.test/source.md')).toBe(false);
    });
});
