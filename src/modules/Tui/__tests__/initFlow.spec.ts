import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readlinkSync, existsSync, lstatSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_init_flow } from '../useCases/initFlow.ts';

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'suspec-initflow-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('run_init_flow — the seed flow (SPEC-suspec-v2 AC-024)', () => {
    it('seeds the repo, offering + accepting the CLAUDE.md link, exit 0', async () => {
        const p = create_mock_prompter({ confirm: [true, true] });
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(0);
        expect(existsSync(join(repo, 'suspec.config.json'))).toBe(true);
        expect(existsSync(join(repo, 'AGENTS.md'))).toBe(true);
        expect(lstatSync(join(repo, 'CLAUDE.md')).isSymbolicLink()).toBe(true);
        expect(readlinkSync(join(repo, 'CLAUDE.md'))).toBe('AGENTS.md');
        expect(p.calls.outros[0]).toContain('npx skills add jcosta33/suspec-skills -g');
    });

    it('declining the CLAUDE.md offer seeds everything else and skips the link', async () => {
        const p = create_mock_prompter({ confirm: [true, false] });
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(0);
        expect(existsSync(join(repo, 'CLAUDE.md'))).toBe(false);
        expect(existsSync(join(repo, 'AGENTS.md'))).toBe(true);
    });

    it('an existing CLAUDE.md suppresses the link offer (one confirm only)', async () => {
        writeFileSync(join(repo, 'CLAUDE.md'), 'MINE\n');
        const p = create_mock_prompter({ confirm: [true] }); // under-scripting a 2nd confirm would throw
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(0);
        expect(p.calls.notes.some((note) => note.title === 'Result')).toBe(true);
    });

    it('declining the seed cancels (exit 1, nothing written)', async () => {
        const p = create_mock_prompter({ confirm: [false] });
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(1);
        expect(existsSync(join(repo, 'suspec.config.json'))).toBe(false);
        expect(p.calls.outros[0]).toBe('Cancelled.');
    });

    it('a cancelled confirm cancels cleanly', async () => {
        const p = create_mock_prompter({ confirm: [CANCEL] });
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(1);
    });

    it('a cancelled CLAUDE.md offer cancels before any seed write', async () => {
        const p = create_mock_prompter({ confirm: [true, CANCEL] });
        expect(await run_init_flow(p, { repoRoot: repo })).toBe(1);
        expect(existsSync(join(repo, 'suspec.config.json'))).toBe(false);
    });

    it('a seed failure reports the error (exit 2)', async () => {
        const p = create_mock_prompter({ confirm: [true, true] });
        expect(await run_init_flow(p, { repoRoot: join(repo, 'missing', 'nested') })).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
        expect(p.calls.outros[0]).toContain('could not seed');
    });
});
