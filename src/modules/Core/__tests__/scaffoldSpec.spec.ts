import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { scaffold_spec } from '../useCases/scaffoldSpec.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-scaffold-'));
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
});
