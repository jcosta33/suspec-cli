import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { read_kit_manifest, DEFAULT_KIT_OWNED, DEFAULT_REQUIRED, MANIFEST_FILENAME } from '../services/kitManifest.ts';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'suspec-manifest-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});
function manifest(body: string): void {
    writeFileSync(join(dir, MANIFEST_FILENAME), body);
}

describe('read_kit_manifest (ADR-0135, pure)', () => {
    it('parses the kit_owned and required block lists (AC-001)', () => {
        manifest('kit_owned:\n  - templates/\n  - hooks/\nrequired:\n  - templates\n  - specs\n');
        const m = read_kit_manifest(dir);
        expect(m).not.toBeNull();
        expect(m?.kitOwned).toEqual(['templates/', 'hooks/']);
        expect(m?.required).toEqual(['templates', 'specs']);
    });

    it('returns null when no manifest is present (AC-004 fallback signal)', () => {
        expect(read_kit_manifest(dir)).toBeNull();
    });

    it('a missing key falls back to its default; the other is still read', () => {
        manifest('required:\n  - foo\n'); // no kit_owned block
        const m = read_kit_manifest(dir);
        expect(m?.kitOwned).toEqual([...DEFAULT_KIT_OWNED]);
        expect(m?.required).toEqual(['foo']);
    });

    it("a key present with no items reads as an empty list (the kit's explicit choice)", () => {
        manifest('kit_owned:\nrequired:\n  - templates\n');
        expect(read_kit_manifest(dir)?.kitOwned).toEqual([]);
    });

    it('ignores comments, blank lines, and unknown keys', () => {
        manifest('# a comment\n\nother: value\nkit_owned:\n  - templates/\n\n# trailing\nrequired:\n  - templates\n');
        const m = read_kit_manifest(dir);
        expect(m?.kitOwned).toEqual(['templates/']);
        expect(m?.required).toEqual(['templates']);
    });

    it('strips an inline `#` comment on a list item so the path never carries the comment', () => {
        manifest('kit_owned:\n  - templates/  # the templates dir\n  - hooks/\t# tab before hash\nrequired:\n  - templates # required\n');
        const m = read_kit_manifest(dir);
        expect(m?.kitOwned).toEqual(['templates/', 'hooks/']);
        expect(m?.required).toEqual(['templates']);
    });

    it('keeps a `#` that is not preceded by whitespace as part of the value (YAML rule)', () => {
        manifest('kit_owned:\n  - templates/tag#1\nrequired:\n  - templates\n');
        expect(read_kit_manifest(dir)?.kitOwned).toEqual(['templates/tag#1']);
    });

    it('the defaults mirror the kit historical layout', () => {
        expect(DEFAULT_KIT_OWNED).toContain('templates/');
        expect(DEFAULT_REQUIRED).toContain('templates');
    });
});
