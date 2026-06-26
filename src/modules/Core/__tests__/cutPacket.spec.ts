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
    ws = mkdtempSync(join(tmpdir(), 'corpus-cut-'));
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

    it("pre-fills each Verify line with the spec's parsed `Verify with:` command, not a {{command}} placeholder (SW-003)", () => {
        // A spec whose ACs put `Verify with:` on its OWN line (the shape the parser lifts a command from):
        // the cut packet must carry that command per scoped AC (the tool already parsed it), so the worker
        // is not retyping data `corpus new task` already had.
        mkdirSync(join(ws, 'specs', 'v'), { recursive: true });
        writeFileSync(
            join(ws, 'specs', 'v', 'spec.md'),
            `---\ntype: spec\nid: SPEC-v\nstatus: ready\nsources:\n  - ADR-0077\n---\n\n## Requirements\n\n### AC-001 — one\nThe tool must do one.\nVerify with: \`pytest tests/test_one.py\`\n\n### AC-002 — two\nThe tool must do two.\nVerify with: \`pytest tests/test_two.py\`\n`
        );
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-v', scope: ['AC-001', 'AC-002'] }));
        const content = read(report.taskId);
        expect(content).toContain('- [ ] `pytest tests/test_one.py` (AC-001)');
        expect(content).toContain('- [ ] `pytest tests/test_two.py` (AC-002)');
        expect(content).not.toContain('{{command}}');
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
        // the Scope list (an exact `- AC-001` line) appears once; the `- AC-001 — verify:` line in the
        // embedded `## Spec snapshot` is a distinct, legitimate occurrence and is not counted here.
        expect(read(report.taskId).match(/^- AC-001$/gm)).toHaveLength(1);
    });

    it('rejects a scope id that is not a requirement of the spec', () => {
        const failure = assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001', 'AC-099'] }));
        expect(failure._tag).toBe('UnknownScope');
    });

    it('errors when the spec id is not found', () => {
        expect(assertErr(cut_packet({ workspaceDir: ws, specId: 'SPEC-missing', scope: [] }))._tag).toBe(
            'SpecNotFound'
        );
        const bare = mkdtempSync(join(tmpdir(), 'corpus-cut-bare-'));
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

    it('embeds the scoped spec slice (## Spec snapshot) for cross-root validation (#2)', () => {
        const report = assertOk(cut_packet({ workspaceDir: ws, specId: 'SPEC-x', scope: ['AC-001'] }));
        const content = read(report.taskId);
        expect(content).toContain('## Spec snapshot');
        expect(content).toContain('embedded-spec: SPEC-x');
        expect(content).toMatch(/- AC-001 — verify: /); // the scoped AC is embedded (with its command or `(none)`)
        expect(content).not.toContain('- AC-002 — verify: '); // only the scoped slice is embedded
    });
});
