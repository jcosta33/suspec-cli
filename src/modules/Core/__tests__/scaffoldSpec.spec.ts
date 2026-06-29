import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { scaffold_spec } from '../useCases/scaffoldSpec.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-scaffold-'));
});

afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('scaffold_spec', () => {
    it('writes a draft spec skeleton at specs/<slug>/spec.md', () => {
        const report = assertOk(
            scaffold_spec({ workspaceDir: ws, slug: 'checkout', title: 'Checkout flow', owner: 'Jane' })
        );
        expect(report.specId).toBe('SPEC-checkout');
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('id: SPEC-checkout');
        expect(content).toContain('title: Checkout flow');
        expect(content).toContain('owner: Jane');
        expect(content).toContain('status: draft');
        expect(content).toContain('### AC-001');
    });

    it('defaults the title and owner when omitted', () => {
        const report = assertOk(scaffold_spec({ workspaceDir: ws, slug: 'feat' }));
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('title: feat');
        expect(content).toContain('owner: {{team-or-person}}');
    });

    it('refuses to overwrite an existing spec', () => {
        assertOk(scaffold_spec({ workspaceDir: ws, slug: 'dup' }));
        expect(assertErr(scaffold_spec({ workspaceDir: ws, slug: 'dup' }))._tag).toBe('SpecExists');
    });

    it('rejects a path-escaping slug (no write outside the workspace)', () => {
        for (const slug of ['../../tmp/escape', '..', 'a/b', '/abs']) {
            expect(assertErr(scaffold_spec({ workspaceDir: ws, slug }))._tag).toBe('Usage');
        }
    });

    it('warns on a duplicate leading ordinal — still scaffolds, suggests the next free (#47)', () => {
        // Seed an existing spec at ordinal 011, then scaffold a different slug sharing 011.
        mkdirSync(join(ws, 'specs', '011-foo'), { recursive: true });
        writeFileSync(join(ws, 'specs', '011-foo', 'spec.md'), 'existing\n');
        const report = assertOk(scaffold_spec({ workspaceDir: ws, slug: '011-bar' }));
        expect(report.level).toBe('warning');
        expect(report.ordinalClash).toBeDefined();
        expect(report.ordinalClash?.ordinal).toBe('011');
        expect(report.ordinalClash?.existingSlug).toBe('011-foo');
        expect(report.ordinalClash?.nextFree).toBe('012');
        // The spec is still created (the clash is non-blocking).
        expect(readFileSync(report.path, 'utf8')).toContain('id: SPEC-011-bar');
    });

    it('does not warn when the leading ordinal is free', () => {
        mkdirSync(join(ws, 'specs', '011-foo'), { recursive: true });
        writeFileSync(join(ws, 'specs', '011-foo', 'spec.md'), 'existing\n');
        const report = assertOk(scaffold_spec({ workspaceDir: ws, slug: '012-baz' }));
        expect(report.level).toBe('clean');
        expect(report.ordinalClash).toBeUndefined();
    });
});
