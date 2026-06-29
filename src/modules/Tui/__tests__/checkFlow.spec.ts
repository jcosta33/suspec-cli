import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_check_flow } from '../useCases/checkFlow.ts';

let ws: string;

const CONFORMANT = `---
type: spec
id: SPEC-x
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — does it
The tool must do it.
Verify with: a test.

## Non-goals

- nope.

## Open questions

- none
`;

beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-checkflow-'));
    mkdirSync(join(ws, 'templates'), { recursive: true }); // a valid workspace (checks.md clause b)
});
afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
});

function writeSpec(name: string, content: string): string {
    mkdirSync(join(ws, 'specs', name), { recursive: true });
    const path = join(ws, 'specs', name, 'spec.md');
    writeFileSync(path, content);
    return path;
}

describe('run_check_flow', () => {
    it('checks the whole workspace and reports a clean verdict', async () => {
        writeSpec('x', CONFORMANT);
        const p = create_mock_prompter({ select: ['workspace'] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Workspace')).toBe(true);
        expect(p.calls.outros[0]).toContain('clean');
    });

    it('checks a single chosen spec and blocks when it has a hard error', async () => {
        const path = writeSpec('bad', CONFORMANT.replace('Verify with: a test.', ''));
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(2);
        expect(p.calls.notes.some((n) => n.title === 'Result')).toBe(true);
    });

    it('warns when the file scope is chosen but there are no specs', async () => {
        const p = create_mock_prompter({ select: ['file'] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('bails cleanly when the scope prompt is cancelled', async () => {
        const p = create_mock_prompter({ select: [CANCEL] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });

    it('reports a warning verdict (exit 1) for a spec with only warnings', async () => {
        // drop Non-goals → C005 warning; add a resolvable relative source → exercises the C009 resolver
        const content = CONFORMANT.replace(/## Non-goals\n\n- nope\.\n\n/, '').replace(
            '  - ADR-0077',
            '  - ADR-0077\n  - ./neighbor.md'
        );
        const path = writeSpec('warn', content);
        writeFileSync(join(ws, 'specs', 'warn', 'neighbor.md'), 'x\n');
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(1);
        expect(p.calls.outros[0]).toContain('warnings');
    });

    it('reports a parse failure on the chosen spec as blocking', async () => {
        const path = writeSpec('broken', 'no frontmatter fence here\n');
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });

    it('bails when the spec choice is cancelled', async () => {
        writeSpec('x', CONFORMANT);
        const p = create_mock_prompter({ select: ['file', CANCEL] });
        const code = await run_check_flow(p, { workspaceDir: ws });
        expect(code).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });
});
