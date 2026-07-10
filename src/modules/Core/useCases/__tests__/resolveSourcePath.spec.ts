import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { build_source_exists } from '../resolveSourcePath.ts';

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'suspec-src-'));
    mkdirSync(join(root, 'specs', 'demo'), { recursive: true });
    mkdirSync(join(root, 'intake'), { recursive: true });
    writeFileSync(join(root, 'specs', 'demo', 'spec.md'), '---\n---\n');
    writeFileSync(join(root, 'specs', 'demo', 'ticket.md'), 'co-located\n'); // beside the spec
    writeFileSync(join(root, 'intake', 'sup-204.md'), 'a distant intake capture\n'); // two levels up
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('build_source_exists — C009 resolves artifact-relative (ADR-0143 D4)', () => {
    it('resolves a co-located ref and a relative path to a distant one; a bare distant ref is broken', () => {
        const exists = build_source_exists(join(root, 'specs', 'demo', 'spec.md'));
        expect(exists('ticket.md')).toBe(true); // resolves beside the spec
        expect(exists('../../intake/sup-204.md')).toBe(true); // a distant ref written artifact-relative
        expect(exists('intake/sup-204.md')).toBe(false); // NOT resolved against any root — broken
        expect(exists('nope.md')).toBe(false); // exists nowhere → broken
    });
});
