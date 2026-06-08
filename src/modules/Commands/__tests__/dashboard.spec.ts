import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
    confirm: vi.fn(),
    intro: vi.fn(),
    isCancel: vi.fn(),
    log: { error: vi.fn(), warn: vi.fn() },
    note: vi.fn(),
    outro: vi.fn(),
    select: vi.fn(),
    text: vi.fn(),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(),
}));

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(),
    worktree_list: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawnSync: vi.fn(),
    };
});

import * as clack from '@clack/prompts';
import { read_state } from '../../AgentState/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';
import { spawnSync } from 'child_process';
import { run_dashboard } from '../useCases/dashboard.ts';

describe('run_dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 1 when not inside a git repository', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error('Not a git repo');
        });

        const result = await run_dashboard();

        expect(result).toBe(1);
        expect(clack.log.error).toHaveBeenCalledWith(
            expect.stringContaining('Not inside a git repository')
        );
    });

    it('exits with 0 when user selects exit', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>).mockResolvedValue('exit');
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

        const result = await run_dashboard();

        expect(result).toBe(0);
        expect(clack.outro).toHaveBeenCalledWith('Goodbye');
    });

    it('exits with 0 when user cancels select', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

        const result = await run_dashboard();

        expect(result).toBe(0);
    });

    it('spawns new command with slug and title', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('new')
            .mockResolvedValueOnce('exit');
        (clack.text as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('my-task')
            .mockResolvedValueOnce('My Task Title');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('new.ts'),
                'my-task',
                'My Task Title',
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('spawns open command with selected slug', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo--foo', head: 'abc', branch: 'agent/foo', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({ foo: { status: 'running' } });
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('open')
            .mockResolvedValueOnce('foo')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('open.ts'),
                'foo',
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('warns and skips when no sandboxes for open', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo', head: 'abc', branch: 'main', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('open')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await run_dashboard();

        expect(clack.log.warn).toHaveBeenCalledWith('No sandboxes to open.');
    });

    it('formats sandbox list with statuses', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo', head: 'abc', branch: 'main', bare: false },
            { path: '/repo--feat', head: 'def', branch: 'agent/feat', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({
            feat: { status: 'running' },
        });
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('list')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('list.ts'),
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('spawns show command', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo--foo', head: 'abc', branch: 'agent/foo', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('show')
            .mockResolvedValueOnce('foo')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('show.ts'),
                'foo',
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('warns when no sandboxes for show', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo', head: 'abc', branch: 'main', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('show')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

        await run_dashboard();

        expect(clack.log.warn).toHaveBeenCalledWith('No sandboxes to show.');
    });

    it('spawns status command', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo--foo', head: 'abc', branch: 'agent/foo', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('status')
            .mockResolvedValueOnce('foo')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('status.ts'),
                'foo',
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('spawns doctor command', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('doctor')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('doctor.ts'),
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('spawns help for unknown action', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('help')
            .mockResolvedValueOnce('exit');
        (clack.confirm as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([
                '--experimental-strip-types',
                expect.stringContaining('help.ts'),
            ]),
            { stdio: 'inherit', cwd: '/repo' }
        );
    });

    it('cancels open when no slug selected', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([
            { path: '/repo--foo', head: 'abc', branch: 'agent/foo', bare: false },
        ]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('open')
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce('exit');
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).not.toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([expect.stringContaining('open.ts')]),
            expect.anything()
        );
    });

    it('cancels new when slug is cancelled', async () => {
        (get_repo_root as ReturnType<typeof vi.fn>).mockReturnValue('/repo');
        (worktree_list as ReturnType<typeof vi.fn>).mockReturnValue([]);
        (read_state as ReturnType<typeof vi.fn>).mockReturnValue({});
        (clack.select as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce('new')
            .mockResolvedValueOnce('exit');
        (clack.text as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (clack.isCancel as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
        (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({ status: 0 });

        await run_dashboard();

        expect(spawnSync).not.toHaveBeenCalledWith(
            process.execPath,
            expect.arrayContaining([expect.stringContaining('new.ts')]),
            expect.anything()
        );
    });
});
