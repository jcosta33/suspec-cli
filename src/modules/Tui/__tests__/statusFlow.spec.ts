import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { run_status_flow } from '../useCases/statusFlow.ts';

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'swarm-statusflow-'));
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

describe('run_status_flow', () => {
    it('renders the board and reports all clear for an empty workspace', () => {
        const p = create_mock_prompter();
        expect(run_status_flow(p, { workspaceDir: ws })).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Board')).toBe(true);
        expect(p.calls.outros[0]).toBe('all clear');
    });

    it('flags attention items in the outro', () => {
        mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
        writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready\n---\n');
        mkdirSync(join(ws, 'tasks'), { recursive: true });
        writeFileSync(
            join(ws, 'tasks', 't1.md'),
            '---\ntype: task\nid: TASK-1\nsource: SPEC-feat\nstatus: review-ready\n---\n'
        );
        const p = create_mock_prompter();
        expect(run_status_flow(p, { workspaceDir: ws })).toBe(0);
        expect(p.calls.outros[0]).toContain('need attention');
    });
});
