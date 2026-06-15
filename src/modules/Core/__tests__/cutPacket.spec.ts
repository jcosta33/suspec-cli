import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { cut_packet } from '../useCases/cutPacket.ts';
import { derive_board } from '../useCases/deriveBoard.ts';

let ws: string;

const SPEC_X = `---
type: spec
id: SPEC-x
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — first
The tool must do one. Verify with: a test.

### AC-002 — second
The tool must do two. Verify with: a test.
`;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-cut-'));
    mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'x', 'spec.md'), SPEC_X);
    mkdirSync(join(ws, 'specs', 'notaspec'), { recursive: true }); // no spec.md → skipped while scanning
});

afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

const read = (taskId: string) => readFileSync(join(ws, 'tasks', `${taskId}.md`), 'utf8');

describe('cut_packet', () => {
    it('copies the named scope ids into the packet', () => {
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001'] }));
        expect(report.scope).toEqual(['AC-001']);
        const content = read(report.taskId);
        expect(content).toContain('scope: [AC-001]');
        expect(content).toContain('- AC-001');
        expect(content).not.toContain('- AC-002');
        expect(content).toContain('source:\n  - SPEC-x');
    });

    it('an empty scope yields an empty Scope — never invents an id', () => {
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: [] }));
        const content = read(report.taskId);
        expect(content).toContain('scope: []');
        expect(content).not.toMatch(/- AC-\d/);
    });

    it('dedups a repeated scope id (no duplicated Scope/Verify entries)', () => {
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001', 'AC-001'] }));
        expect(report.scope).toEqual(['AC-001']);
        expect(read(report.taskId).match(/- AC-001\b/g)).toHaveLength(1);
    });

    it('rejects a scope id that is not a requirement of the spec', () => {
        const failure = assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001', 'AC-099'] }));
        expect(failure._tag).toBe('UnknownScope');
    });

    it('errors when the spec id is not found', () => {
        expect(assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-missing', scope: [] }))._tag).toBe(
            'SpecNotFound'
        );
        const bare = mkdtempSync(join(tmpdir(), 'swarm-cut-bare-'));
        try {
            expect(assertErr(cut_packet({ workspaceDir: bare, specId: 'SPEC-x', scope: [] }))._tag).toBe(
                'SpecNotFound'
            );
        } finally {
            rmSync(bare, { recursive: true, force: true });
        }
    });

    it('round-trip: a cut task links to its spec on the derived board', () => {
        // The seam the unit fixtures missed: cut_packet writes `source:` as a block list, which
        // derive_board must parse to link the task under its spec.
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001'] }));
        const board = assertOk(derive_board({ workspaceDir: ws }));
        const specRow = board.specs.find((row) => row.id === 'SPEC-x');
        expect(specRow?.tasks.map((task) => task.id)).toContain(report.taskId);
    });

    it('uses a custom task id and refuses to clobber an existing packet', () => {
        const first = assertOk(
            cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-002'], taskId: 'TASK-custom' })
        );
        expect(first.taskId).toBe('TASK-custom');
        expect(
            assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-002'], taskId: 'TASK-custom' }))._tag
        ).toBe('TaskExists');
    });

    it('rejects a path-escaping task id — custom, or derived from a malicious spec id (no write outside tasks/)', () => {
        expect(
            assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: [], taskId: '../../tmp/escape' }))._tag
        ).toBe('Usage');
        // a spec whose on-disk frontmatter id derives an escaping default task id
        mkdirSync(join(ws, 'specs', 'evil'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'evil', 'spec.md'), SPEC_X.replace('id: SPEC-x', 'id: SPEC-../../tmp/escape'));
        expect(assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-../../tmp/escape', scope: [] }))._tag).toBe(
            'Usage'
        );
    });
});
