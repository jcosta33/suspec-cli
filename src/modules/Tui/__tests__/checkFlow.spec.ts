import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_check_flow } from '../useCases/checkFlow.ts';

let root: string;
let repo: string;
let store: string;
let savedStateDir: string | undefined;

const CONFORMANT = `---
type: spec
id: SPEC-x
status: ready
sources:
  - notes.md
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
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-checkflow-'));
    repo = join(root, 'proj');
    mkdirSync(repo, { recursive: true });
    const stateRoot = join(root, 'state');
    store = join(stateRoot, basename(repo));
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, '.repo-path'), `${repo}\n`);
    writeFileSync(join(store, 'notes.md'), 'origin\n');
    savedStateDir = process.env.SUSPEC_STATE_DIR;
    process.env.SUSPEC_STATE_DIR = stateRoot;
});
afterEach(() => {
    if (savedStateDir === undefined) {
        delete process.env.SUSPEC_STATE_DIR;
    } else {
        process.env.SUSPEC_STATE_DIR = savedStateDir;
    }
    rmSync(root, { recursive: true, force: true });
});

function writeStoreSpec(slug: string, content: string): string {
    const path = join(store, `spec-${slug}.md`);
    writeFileSync(path, content);
    return path;
}

describe('run_check_flow — the store lint scope (ADR-0137)', () => {
    it("lints the store's artifacts and reports a clean level", async () => {
        writeStoreSpec('x', CONFORMANT);
        const p = create_mock_prompter({ select: ['store'] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(0);
        expect(p.calls.notes.some((n) => n.title === 'Store')).toBe(true);
        expect(p.calls.outros[0]).toContain('clean');
    });

    it('a broken store artifact blocks the store scope', async () => {
        writeStoreSpec('broken', 'no frontmatter fence here\n');
        const p = create_mock_prompter({ select: ['store'] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(2);
        expect(p.calls.outros[0]).toContain('blocking');
    });

    it('a repo with no store reads clean for the store scope', async () => {
        rmSync(store, { recursive: true, force: true });
        const p = create_mock_prompter({ select: ['store'] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(0);
        expect(p.calls.notes.some((n) => n.message.includes('no store'))).toBe(true);
    });

    it('checks a single chosen store spec and blocks when it has a hard error', async () => {
        const path = writeStoreSpec('bad', CONFORMANT.replace('Verify with: a test.', ''));
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(2);
        expect(p.calls.notes.some((n) => n.title === 'Result')).toBe(true);
    });

    it('warns when the file scope is chosen but the store has no specs', async () => {
        const p = create_mock_prompter({ select: ['file'] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(1);
        expect(p.calls.warns.length).toBeGreaterThan(0);
    });

    it('resolves the repo root through git from a subdir of a real repo', async () => {
        execFileSync('git', ['init'], { cwd: repo });
        writeStoreSpec('x', CONFORMANT);
        const sub = join(repo, 'packages');
        mkdirSync(sub, { recursive: true });
        const p = create_mock_prompter({ select: ['store'] });
        expect(await run_check_flow(p, { cwd: sub })).toBe(0);
        expect(p.calls.notes.find((n) => n.title === 'Store')?.message).toContain('spec-x.md');
    });

    it('bails cleanly when the scope prompt is cancelled', async () => {
        const p = create_mock_prompter({ select: [CANCEL] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });

    it('reports a warning level (exit 1) for a spec with only warnings', async () => {
        // drop Non-goals → C005 warning; the source `notes.md` resolves against the store root (C009)
        const content = CONFORMANT.replace(/## Non-goals\n\n- nope\.\n\n/, '');
        const path = writeStoreSpec('warn', content);
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(1);
        expect(p.calls.outros[0]).toContain('warnings');
    });

    it('reports a parse failure on the chosen spec as blocking', async () => {
        const path = writeStoreSpec('broken', 'no frontmatter fence here\n');
        const p = create_mock_prompter({ select: ['file', path] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });

    it('bails when the spec choice is cancelled', async () => {
        writeStoreSpec('x', CONFORMANT);
        const p = create_mock_prompter({ select: ['file', CANCEL] });
        const code = await run_check_flow(p, { cwd: repo });
        expect(code).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });
});
