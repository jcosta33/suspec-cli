import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_new_flow } from '../useCases/newFlow.ts';

let ws: string;

const SPEC_X = `---
type: spec
id: SPEC-x
status: ready
---

## Requirements

### AC-001 — one
The tool must do one.
Verify with: a test.

### AC-002 — two
The tool must do two.
Verify with: a test.
`;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-newflow-'));
    mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'x', 'spec.md'), SPEC_X);
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('run_new_flow', () => {
    it('scaffolds a new spec', async () => {
        const p = create_mock_prompter({ select: ['spec'], text: ['checkout', 'Checkout flow'] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(0);
        expect(existsSync(join(ws, 'specs', 'checkout', 'spec.md'))).toBe(true);
        expect(p.calls.successes.some((s) => s.includes('SPEC-checkout'))).toBe(true);
    });

    it('cuts a task packet with the chosen scope', async () => {
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(0);
        expect(existsSync(join(ws, 'tasks', 'TASK-x.md'))).toBe(true);
        expect(p.calls.successes.some((s) => s.includes('1 scoped'))).toBe(true);
    });

    it('cuts a task with empty scope when the spec has no requirements', async () => {
        mkdirSync(join(ws, 'specs', 'bare'), { recursive: true });
        writeFileSync(
            join(ws, 'specs', 'bare', 'spec.md'),
            '---\ntype: spec\nid: SPEC-bare\nstatus: draft\n---\n\n## Intent\n\nnone\n'
        );
        const p = create_mock_prompter({ select: ['task', 'SPEC-bare'] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(0);
        expect(p.calls.successes.some((s) => s.includes('0 scoped'))).toBe(true);
    });

    it('skips invalid specs when listing (no spec.md / no id / unparseable)', async () => {
        mkdirSync(join(ws, 'specs', 'notaspec'), { recursive: true }); // no spec.md
        mkdirSync(join(ws, 'specs', 'noid'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'noid', 'spec.md'), '---\ntype: spec\nstatus: draft\n---\n'); // no id
        mkdirSync(join(ws, 'specs', 'broken'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'broken', 'spec.md'), 'no frontmatter\n'); // unparseable
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(0);
    });

    it('warns when there are no specs to cut from', async () => {
        rmSync(join(ws, 'specs'), { recursive: true, force: true });
        const p = create_mock_prompter({ select: ['task'] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('surfaces a scaffold conflict as exit 2', async () => {
        await run_new_flow(create_mock_prompter({ select: ['spec'], text: ['dup', 'Dup'] }), { workspaceDir: ws });
        const p = create_mock_prompter({ select: ['spec'], text: ['dup', 'Dup'] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });

    it('a second default-id cut auto-suffixes instead of conflicting (SPEC-first-hour-qol AC-004)', async () => {
        await run_new_flow(create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-001']] }), {
            workspaceDir: ws,
        });
        const p = create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [['AC-002']] });
        expect(await run_new_flow(p, { workspaceDir: ws })).toBe(0);
        expect(existsSync(join(ws, 'tasks', 'TASK-x-2.md'))).toBe(true);
    });

    it('bails on cancel at each prompt', async () => {
        expect(await run_new_flow(create_mock_prompter({ select: [CANCEL] }), { workspaceDir: ws })).toBe(1);
        expect(
            await run_new_flow(create_mock_prompter({ select: ['spec'], text: [CANCEL] }), { workspaceDir: ws })
        ).toBe(1);
        expect(
            await run_new_flow(create_mock_prompter({ select: ['spec'], text: ['s', CANCEL] }), { workspaceDir: ws })
        ).toBe(1);
        expect(await run_new_flow(create_mock_prompter({ select: ['task', CANCEL] }), { workspaceDir: ws })).toBe(1);
        expect(
            await run_new_flow(create_mock_prompter({ select: ['task', 'SPEC-x'], multiselect: [CANCEL] }), {
                workspaceDir: ws,
            })
        ).toBe(1);
    });
});
