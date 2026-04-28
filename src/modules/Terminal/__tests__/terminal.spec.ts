import { parse_args } from '../useCases/cli.ts';
import { load_config } from '../useCases/config.ts';
import { resolve_backend, check_backend, build_banner, strip_flag, posix_quote } from '../useCases/terminal.ts';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('terminal module', () => {
    describe('parse_args', () => {
        it('parses positional arguments', () => {
            const result = parse_args(['new', 'my-task', 'Task Title']);
            expect(result.positional).toEqual(['new', 'my-task', 'Task Title']);
            expect(result.flags.size).toBe(0);
        });

        it('parses long flags with values', () => {
            const result = parse_args(['--agent', 'claude', '--type', 'feature']);
            expect(result.flags.get('agent')).toBe('claude');
            expect(result.flags.get('type')).toBe('feature');
        });

        it('parses long flags with equals syntax', () => {
            const result = parse_args(['--agent=gemini', '--type=fix']);
            expect(result.flags.get('agent')).toBe('gemini');
            expect(result.flags.get('type')).toBe('fix');
        });

        it('parses boolean long flags', () => {
            const result = parse_args(['--verbose', '--dry-run']);
            expect(result.flags.get('verbose')).toBe(true);
            expect(result.flags.get('dry-run')).toBe(true);
        });

        it('parses short flags with values', () => {
            const result = parse_args(['-a', 'claude', '-t', 'refactor']);
            expect(result.flags.get('a')).toBe('claude');
            expect(result.flags.get('t')).toBe('refactor');
        });

        it('parses short boolean flags', () => {
            const result = parse_args(['-v', '-d']);
            expect(result.flags.get('v')).toBe(true);
            expect(result.flags.get('d')).toBe(true);
        });

        it('stops flag parsing after -- separator', () => {
            const result = parse_args(['--agent', 'claude', '--', '--type', 'feature']);
            expect(result.flags.get('agent')).toBe('claude');
            expect(result.positional).toEqual(['--type', 'feature']);
        });

        it('handles mixed positional and flags', () => {
            const result = parse_args(['new', 'my-task', '--agent', 'claude', 'Extra Title']);
            expect(result.positional).toEqual(['new', 'my-task', 'Extra Title']);
            expect(result.flags.get('agent')).toBe('claude');
        });
    });

    describe('resolve_backend', () => {
        const originalPlatform = process.platform;

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('returns requested backend when not auto', () => {
            expect(resolve_backend('current')).toBe('current');
            expect(resolve_backend('terminal')).toBe('terminal');
            expect(resolve_backend('iterm')).toBe('iterm');
        });

        it('resolves auto to terminal on darwin', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            expect(resolve_backend('auto')).toBe('terminal');
        });

        it('resolves auto to windows-auto on win32', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            expect(resolve_backend('auto')).toBe('windows-auto');
        });

        it('resolves auto to linux-auto on linux', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            expect(resolve_backend('auto')).toBe('linux-auto');
        });
    });

    describe('check_backend', () => {
        const originalPlatform = process.platform;

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('current is always available', () => {
            expect(check_backend('current')).toEqual({ ok: true });
        });

        it('terminal requires darwin', () => {
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            expect(check_backend('terminal')).toEqual({ ok: true });
            Object.defineProperty(process, 'platform', { value: 'linux' });
            expect(check_backend('terminal')).toEqual({ ok: false, reason: 'Terminal.app is macOS only' });
        });

        it('iterm requires darwin', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            expect(check_backend('iterm')).toEqual({ ok: false, reason: 'iTerm2 is macOS only' });
        });

        it('linux-auto requires linux', () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });
            expect(check_backend('linux-auto')).toEqual({ ok: true });
            Object.defineProperty(process, 'platform', { value: 'darwin' });
            expect(check_backend('linux-auto')).toEqual({ ok: false, reason: 'linux-auto requires Linux' });
        });

        it('windows-auto requires windows', () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });
            expect(check_backend('windows-auto')).toEqual({ ok: true });
            Object.defineProperty(process, 'platform', { value: 'linux' });
            expect(check_backend('windows-auto')).toEqual({ ok: false, reason: 'windows-auto requires Windows' });
        });

        it('auto is always available', () => {
            expect(check_backend('auto')).toEqual({ ok: true });
        });

        it('returns error for unknown backend', () => {
            expect(check_backend('unknown-backend')).toEqual({ ok: false, reason: 'Unknown terminal backend: unknown-backend' });
        });
    });

    describe('build_banner', () => {
        it('builds a banner string with all fields', () => {
            const banner = build_banner({
                title: 'Test Task',
                slug: 'test-task',
                branch: 'agent/test-task',
                taskFile: '.agents/tasks/test-task.md',
                agent: 'claude',
            });
            expect(banner).toContain('Test Task');
            expect(banner).toContain('test-task');
            expect(banner).toContain('agent/test-task');
            expect(banner).toContain('.agents/tasks/test-task.md');
            expect(banner).toContain('claude');
        });
    });

    describe('strip_flag', () => {
        it('removes a flag and its value from args', () => {
            expect(strip_flag('--name', ['--name', 'my-slug', '--verbose'])).toEqual(['--verbose']);
        });

        it('returns unchanged when flag is not present', () => {
            expect(strip_flag('--name', ['--verbose', '--debug'])).toEqual(['--verbose', '--debug']);
        });

        it('handles flag at the end of array', () => {
            expect(strip_flag('--name', ['--verbose', '--name'])).toEqual(['--verbose']);
        });
    });

    describe('posix_quote', () => {
        it('wraps simple strings in single quotes', () => {
            expect(posix_quote('hello')).toBe("'hello'");
        });

        it('escapes single quotes correctly', () => {
            expect(posix_quote("it's")).toBe("'it'\\''s'");
        });

        it('handles empty string', () => {
            expect(posix_quote('')).toBe("''");
        });
    });

    describe('load_config', () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = mkdtempSync(join(tmpdir(), 'swarm-config-test-'));
        });

        afterEach(() => {
            rmSync(tempDir, { recursive: true, force: true });
        });

        it('returns defaults when no config file exists', () => {
            const config = load_config(tempDir);
            expect(config.defaultBaseBranch).toBe('main');
            expect(config.defaultAgent).toBe('claude');
            expect(config.worktreeDirPattern).toBe('../{repoName}--{slug}');
            expect(config.commands).toEqual({
                install: 'pnpm i',
                typecheck: 'pnpm typecheck',
                validateDeps: 'pnpm deps:validate',
                test: 'pnpm test',
            });
        });

        it('reads swarm.config.json and merges with defaults', () => {
            const configPath = join(tempDir, 'swarm.config.json');
            writeFileSync(configPath, JSON.stringify({
                defaultAgent: 'gemini',
                slugMaxLen: 30,
            }), 'utf8');

            const config = load_config(tempDir);
            expect(config.defaultAgent).toBe('gemini');
            expect(config.slugMaxLen).toBe(30);
            expect(config.defaultBaseBranch).toBe('main'); // default preserved
        });

        it('falls back to legacy config path when present', () => {
            const legacyDir = join(tempDir, 'scripts', 'agents');
            mkdirSync(legacyDir, { recursive: true });
            const legacyPath = join(legacyDir, 'config.json');
            writeFileSync(legacyPath, JSON.stringify({
                defaultAgent: 'codex',
            }), 'utf8');

            const config = load_config(tempDir);
            expect(config.defaultAgent).toBe('codex');
        });

        it('returns defaults when config file is malformed', () => {
            const configPath = join(tempDir, 'swarm.config.json');
            writeFileSync(configPath, 'not valid json', 'utf8');

            const config = load_config(tempDir);
            expect(config.defaultBaseBranch).toBe('main');
            expect(config.defaultAgent).toBe('claude');
        });

        it('merges agent configs deeply', () => {
            const configPath = join(tempDir, 'swarm.config.json');
            writeFileSync(configPath, JSON.stringify({
                agents: {
                    kimi: { command: 'kimi', args: ['--verbose'] },
                },
            }), 'utf8');

            const config = load_config(tempDir);
            expect(config.agents?.claude).toEqual({ command: 'claude', args: [] }); // default preserved
            expect(config.agents?.kimi).toEqual({ command: 'kimi', args: ['--verbose'] });
        });
    });
});
