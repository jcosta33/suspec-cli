import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    log: { warn: vi.fn(), message: vi.fn(), success: vi.fn(), error: vi.fn() },
    spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    confirm: vi.fn(),
    isCancel: vi.fn(),
    cancel: vi.fn(),
    text: vi.fn(),
    select: vi.fn(),
    password: vi.fn(),
    group: vi.fn(async (prompts: Record<string, () => Promise<unknown>>) => {
        const results: Record<string, unknown> = {};
        for (const [key, fn] of Object.entries(prompts)) {
            results[key] = await fn();
        }
        return results;
    }),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        cpSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
    };
});

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawnSync: vi.fn(),
    };
});

import * as clack from '@clack/prompts';
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { cmd_init } from '../useCases/init.ts';

describe('cmd_init', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
        (clack.password as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('claude')
            .mockResolvedValueOnce('cursor');
        (clack.text as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('npm test')
            .mockResolvedValueOnce('tsc --noEmit');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('aborts when user declines re-initialization', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(false);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const result = await cmd_init('/repo', []);

        expect(result).toBe(0);
        expect(clack.cancel).toHaveBeenCalledWith('Setup aborted.');
        expect(mkdirSync).not.toHaveBeenCalled();
    });

    it('creates directories and config on fresh init', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
            status: 0,
            stdout: 'true',
        });

        const result = await cmd_init('/repo', []);

        expect(result).toBe(0);
        expect(mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('.agents'),
            { recursive: true }
        );
        expect(writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('swarm.config.json'),
            expect.stringContaining('npm test'),
            'utf8'
        );
    });

    it('enables git rerere when not already enabled', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce({ status: 0, stdout: 'main' }) // branch --show-current
            .mockReturnValueOnce({ status: 0, stdout: '' }) // rerere check
            .mockReturnValueOnce({ status: 0, stdout: '' }); // rerere enable

        await cmd_init('/repo', []);

        const calls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[1]).toEqual([
            'git',
            ['config', 'rerere.enabled'],
            { cwd: '/repo', encoding: 'utf8' },
        ]);
        expect(calls[2]).toEqual([
            'git',
            ['config', 'rerere.enabled', 'true'],
            { cwd: '/repo', encoding: 'utf8' },
        ]);
    });

    it('writes correct config structure', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
            status: 0,
            stdout: 'true',
        });

        await cmd_init('/repo', []);

        const [configPath, configContent] = (
            writeFileSync as ReturnType<typeof vi.fn>
        ).mock.calls[0] as [string, string, string];

        expect(configPath).toContain('swarm.config.json');
        const parsed = JSON.parse(configContent) as {
            commands: Record<string, string>;
            agentRules: string[];
            defaultAgent: string;
            defaultEditor: string;
        };
        expect(parsed.commands.install).toBe('npm install');
        expect(parsed.commands.test).toBe('npm test');
        expect(parsed.commands.typecheck).toBe('tsc --noEmit');
        expect(parsed.defaultAgent).toBe('claude');
        expect(parsed.defaultEditor).toBe('cursor');
    });

    it('saves API keys to .env if provided', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0, stdout: 'true' });
        (clack.password as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('sk-ant-123')
            .mockResolvedValueOnce('sk-proj-456');

        await cmd_init('/repo', []);

        const calls = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
        const envCall = calls.find(call => call[0].endsWith('.env'));
        expect(envCall).toBeTruthy();
        expect(envCall[1]).toContain('ANTHROPIC_API_KEY=sk-ant-123');
        expect(envCall[1]).toContain('OPENAI_API_KEY=sk-proj-456');
    });

    it('re-initializes when user confirms overwrite', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0, stdout: 'true' });

        const result = await cmd_init('/repo', []);
        expect(result).toBe(0);
        expect(writeFileSync).toHaveBeenCalled();
    });

    it('reads existing API keys from .env', async () => {
        (existsSync as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce(false) // agentsDir
            .mockReturnValueOnce(true)  // envPath
            .mockReturnValueOnce(false) // agentsDir again
            .mockReturnValueOnce(false) // tasksDir etc.
            .mockReturnValueOnce(false);
        (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('ANTHROPIC_API_KEY=existing\nOPENAI_API_KEY=existing');
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0, stdout: 'true' });

        await cmd_init('/repo', []);
        expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('.env'), 'utf8');
    });

    it('skips scaffold when scaffold dir does not exist', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0, stdout: 'true' });
        await cmd_init('/repo', []);
        expect(cpSync).not.toHaveBeenCalled();
    });

    it('handles git rerere already enabled', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce({ status: 0, stdout: 'main' })
            .mockReturnValueOnce({ status: 0, stdout: 'true' });
        await cmd_init('/repo', []);
        const calls = (spawnSync as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls.length).toBe(2);
    });

    it('handles git rerere enable failure', async () => {
        (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>)
            .mockReturnValueOnce({ status: 0, stdout: 'main' })
            .mockReturnValueOnce({ status: 0, stdout: '' })
            .mockReturnValueOnce({ status: 1, stderr: 'error' });
        await cmd_init('/repo', []);
        expect(spawnSync).toHaveBeenCalledTimes(3);
    });
});
