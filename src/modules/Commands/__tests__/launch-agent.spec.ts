import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../Adapters/useCases/index.ts', () => ({
    get_adapter: vi.fn(),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    write_state: vi.fn(),
}));

vi.mock('../../Terminal/useCases/index.ts', () => ({
    check_backend: vi.fn(),
    command_exists: vi.fn(),
    error: vi.fn(),
    launch: vi.fn(),
    load_config: vi.fn(),
    red: vi.fn((text: string) => text),
    resolve_backend: vi.fn((backend: string) => backend),
    notify: vi.fn(),
}));

import { get_adapter } from '../../Adapters/useCases/index.ts';
import { write_state } from '../../AgentState/useCases/index.ts';
import {
    check_backend,
    command_exists,
    error,
    launch,
    load_config,
    resolve_backend,
} from '../../Terminal/useCases/index.ts';
import { launch_agent, run_agent_launch } from '../useCases/launch-agent.ts';

describe('launch_agent', () => {
    beforeEach(() => {
        // resetAllMocks clears both call history *and* implementations so that
        // a `mockReturnValue` from one test does not leak into the next.
        vi.resetAllMocks();
    });

    it('returns 1 when agent is not configured', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: {},
        });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(1);
        expect(error).toHaveBeenCalledWith('Agent "claude" not configured.');
    });

    it('returns 1 when agent command is not found in PATH', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: [] } },
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(1);
        expect(error).toHaveBeenCalledWith(
            'Agent command "claude" not found in PATH. Install claude first.'
        );
    });

    it('returns 1 when backend is not available', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: [] } },
            defaultTerminal: 'iterm',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('iterm');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({
            ok: false,
            reason: 'iTerm2 is macOS only',
        });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(1);
        expect(error).toHaveBeenCalledWith(
            'Backend "iterm" is not available: iTerm2 is macOS only'
        );
    });

    it('launches agent and writes state on success', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: ['--verbose'] } },
            defaultTerminal: 'current',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (get_adapter as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 0 });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
            title: 'Test Task',
        });

        expect(result).toBe(0);
        expect(write_state).toHaveBeenCalledWith('/repo', 'test-slug', {
            status: 'running',
            backend: 'current',
            agent: 'claude',
        });
        expect(launch).toHaveBeenCalledWith(
            'current',
            '/repo--test-slug',
            'claude',
            ['--verbose'],
            {
                title: 'Test Task',
                slug: 'test-slug',
                branch: 'agent/test-slug',
                taskFile: '/repo--test-slug/.agents/tasks/test-slug.md',
                agent: 'claude',
            },
            '/repo'
        );
    });

    it('uses adapter build_args when adapter is found', () => {
        const build_args = vi.fn(() => ['--slug', 'test-slug']);
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'kimi',
            agents: { kimi: { command: 'kimi', args: [] } },
            defaultTerminal: 'current',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (get_adapter as ReturnType<typeof vi.fn>).mockReturnValue({
            command: 'kimi',
            build_args,
        });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 0 });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
            agent: 'kimi',
        });

        expect(result).toBe(0);
        expect(build_args).toHaveBeenCalledWith('test-slug', []);
        expect(launch).toHaveBeenCalledWith(
            'current',
            '/repo--test-slug',
            'kimi',
            ['--slug', 'test-slug'],
            expect.anything(),
            '/repo'
        );
    });

    it('uses agentOverride when provided', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: {
                claude: { command: 'claude', args: [] },
                gemini: { command: 'gemini', args: [] },
            },
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 0 });

        launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
            agent: 'gemini',
        });

        expect(launch).toHaveBeenCalledWith(
            'current',
            '/repo--test-slug',
            'gemini',
            [],
            expect.objectContaining({ agent: 'gemini' }),
            '/repo'
        );
    });

    it('defaults to claude when no defaultAgent or override', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            agents: { claude: { command: 'claude', args: [] } },
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 0 });

        launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(launch).toHaveBeenCalledWith(
            'current',
            '/repo--test-slug',
            'claude',
            [],
            expect.objectContaining({ agent: 'claude' }),
            '/repo'
        );
    });

    it('returns launch exit code when it is a number', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: [] } },
            defaultTerminal: 'current',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 42 });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(42);
    });

    it('returns 0 when launch returns undefined', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: [] } },
            defaultTerminal: 'terminal',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('terminal');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: undefined });

        const result = launch_agent({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(0);
    });
});

describe('run_agent_launch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 0 on successful launch', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: { claude: { command: 'claude', args: [] } },
            defaultTerminal: 'current',
        });
        (command_exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (resolve_backend as ReturnType<typeof vi.fn>).mockReturnValue('current');
        (check_backend as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true });
        (launch as ReturnType<typeof vi.fn>).mockReturnValue({ ok: true, value: 0 });

        const result = run_agent_launch({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(0);
    });

    it('returns non-zero exit code from launch_agent', () => {
        (load_config as ReturnType<typeof vi.fn>).mockReturnValue({
            defaultAgent: 'claude',
            agents: {},
        });

        const result = run_agent_launch({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(1);
    });

    it('returns 1 and logs error when launch_agent throws', () => {
        (load_config as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error('Config corrupted');
        });

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = run_agent_launch({
            repoRoot: '/repo',
            slug: 'test-slug',
            worktreePath: '/repo--test-slug',
        });

        expect(result).toBe(1);
        expect(consoleSpy).toHaveBeenCalledWith(
            'Failed to launch agent: Config corrupted'
        );

        consoleSpy.mockRestore();
    });
});
