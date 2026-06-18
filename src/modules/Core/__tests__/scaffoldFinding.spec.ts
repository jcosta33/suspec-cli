import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { scaffold_finding } from '../useCases/scaffoldFinding.ts';

let ws: string;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-promote-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('scaffold_finding — candidate finding, asserting no learning (AC-002)', () => {
    it('writes findings/<slug>.md with `from:` pre-filled and the learning body left a template placeholder', () => {
        const report = assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-checkout-flow' }));
        expect(report.slug).toBe('checkout-flow');
        expect(report.from).toBe('TASK-checkout-flow');
        expect(report.path).toBe(join(ws, 'findings', 'checkout-flow.md'));

        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('type: finding');
        expect(content).toContain('id: FINDING-checkout-flow');
        expect(content).toContain('status: candidate');
        // `from:` is pre-filled with the source id; the scaffold asserts no learning of its own.
        expect(content).toContain('from: TASK-checkout-flow');
        expect(content).toContain('## What we learned');
        expect(content).toContain('{{the durable fact, decision, or pattern — one claim}}');
        // It states no finding: every content field is still a template placeholder.
        expect(content).toContain('# Finding: {{title}}');
        expect(content).toContain('{{link to the review packet, PR, or pasted output that grounds it}}');
    });

    it('derives the slug from a REVIEW- / AUDIT- / INV- prefix too', () => {
        expect(assertOk(scaffold_finding({ workspaceDir: ws, from: 'REVIEW-auth' })).slug).toBe('auth');
        expect(assertOk(scaffold_finding({ workspaceDir: ws, from: 'AUDIT-surface' })).slug).toBe('surface');
        expect(assertOk(scaffold_finding({ workspaceDir: ws, from: 'INV-payments' })).slug).toBe('payments');
    });

    it('writes only the one finding file', () => {
        assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-x' }));
        expect(readdirSync(join(ws, 'findings'))).toEqual(['x.md']);
    });
});

describe('scaffold_finding — write-safety (AC-004)', () => {
    it('refuses to overwrite an existing finding; only --force replaces it', () => {
        assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-dup' }));
        const before = readFileSync(join(ws, 'findings', 'dup.md'), 'utf8');
        expect(assertErr(scaffold_finding({ workspaceDir: ws, from: 'TASK-dup' }))._tag).toBe('FileExists');
        expect(readFileSync(join(ws, 'findings', 'dup.md'), 'utf8')).toBe(before);
        assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-dup', force: true }));
        expect(readdirSync(join(ws, 'findings'))).toEqual(['dup.md']);
    });

    it('leaves an existing status.md byte-unchanged (the board is never touched, AC-003)', () => {
        const board = '# Board\n\n| spec | task |\n';
        writeFileSync(join(ws, 'status.md'), board);
        assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-y' }));
        expect(readFileSync(join(ws, 'status.md'), 'utf8')).toBe(board);
    });
});

describe('scaffold_finding — usage errors', () => {
    it('rejects an empty source id', () => {
        expect(assertErr(scaffold_finding({ workspaceDir: ws, from: '  ' }))._tag).toBe('Usage');
    });

    it('rejects a path-escaping source id (no write outside the workspace)', () => {
        for (const from of ['../escape', '..', 'a/b', 'TASK-/abs']) {
            expect(assertErr(scaffold_finding({ workspaceDir: ws, from }))._tag).toBe('Usage');
        }
        expect(existsSync(join(ws, 'findings'))).toBe(false);
    });
});
