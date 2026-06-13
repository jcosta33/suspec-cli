import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { create_mock_prompter } from '../testing/mockPrompter.ts';
import { CANCEL } from '../useCases/prompter.ts';
import { run_init_flow } from '../useCases/initFlow.ts';

let kit: string;
let target: string;

beforeAll(() => {
    kit = mkdtempSync(join(tmpdir(), 'swarm-initflowkit-'));
    writeFileSync(join(kit, 'AGENTS.md'), 'KIT AGENTS\n');
    writeFileSync(join(kit, '.gitignore.additions'), 'node_modules/');
    writeFileSync(join(kit, 'README.md'), 'KIT README\n');
    mkdirSync(join(kit, 'specs'), { recursive: true });
    writeFileSync(join(kit, 'specs', 'keep.md'), 'x\n');
});
afterAll(() => {
    rmSync(kit, { recursive: true, force: true });
});
beforeEach(() => {
    target = mkdtempSync(join(tmpdir(), 'swarm-initflowtarget-'));
});
afterEach(() => {
    rmSync(target, { recursive: true, force: true });
});

describe('run_init_flow', () => {
    it('scaffolds a clean workspace (skip policy), exit 0', async () => {
        const p = create_mock_prompter({ confirm: [true], select: ['skip'] });
        expect(await run_init_flow(p, { sourceDir: kit, targetDir: target, mode: 'workspace' })).toBe(0);
        expect(existsSync(join(target, 'AGENTS.md'))).toBe(true);
        expect(p.calls.outros[0]).toContain('workspace ready');
    });

    it('reports skipped files (warning) when a conflict is kept', async () => {
        writeFileSync(join(target, 'README.md'), 'USER\n');
        const p = create_mock_prompter({ confirm: [true], select: ['skip'] });
        expect(await run_init_flow(p, { sourceDir: kit, targetDir: target, mode: 'workspace' })).toBe(1);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('USER\n');
        expect(p.calls.outros[0]).toContain('kept');
    });

    it('honours the backup policy', async () => {
        writeFileSync(join(target, 'README.md'), 'USER\n');
        const p = create_mock_prompter({ confirm: [true], select: ['backup'] });
        expect(await run_init_flow(p, { sourceDir: kit, targetDir: target, mode: 'workspace' })).toBe(0);
        expect(existsSync(join(target, 'README.md.swarm-bak'))).toBe(true);
    });

    it('honours the overwrite policy', async () => {
        writeFileSync(join(target, 'README.md'), 'USER\n');
        const p = create_mock_prompter({ confirm: [true], select: ['overwrite'] });
        expect(await run_init_flow(p, { sourceDir: kit, targetDir: target, mode: 'workspace' })).toBe(0);
        expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('KIT README\n');
    });

    it('bails when the plan is declined', async () => {
        const p = create_mock_prompter({ confirm: [false] });
        expect(await run_init_flow(p, { sourceDir: kit, targetDir: target, mode: 'workspace' })).toBe(1);
        expect(p.calls.outros).toEqual(['Cancelled.']);
    });

    it('bails on cancel at the confirm and the policy prompts', async () => {
        expect(
            await run_init_flow(create_mock_prompter({ confirm: [CANCEL] }), {
                sourceDir: kit,
                targetDir: target,
                mode: 'workspace',
            })
        ).toBe(1);
        expect(
            await run_init_flow(create_mock_prompter({ confirm: [true], select: [CANCEL] }), {
                sourceDir: kit,
                targetDir: target,
                mode: 'footprint',
            })
        ).toBe(1);
    });

    it('surfaces an engine error (missing source) as exit 2', async () => {
        const p = create_mock_prompter({ confirm: [true], select: ['skip'] });
        expect(await run_init_flow(p, { sourceDir: '/no/such/kit', targetDir: target, mode: 'workspace' })).toBe(2);
        expect(p.calls.errors.length).toBeGreaterThan(0);
    });
});
