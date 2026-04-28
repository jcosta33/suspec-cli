import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    worktree_list: vi.fn(),
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({})),
    is_process_running: vi.fn(() => true),
}));

import { worktree_list } from '../../Workspace/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { read_state, is_process_running } from '../../AgentState/useCases/index.ts';
import { run, Dashboard } from '../useCases/ui.tsx';

describe('ui', () => {
    beforeEach(() => {
        vi.mocked(read_state).mockReturnValue({});
        vi.mocked(is_process_running).mockReturnValue(true);
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Dashboard', () => {
        it('renders dashboard with no sandboxes', () => {
            vi.mocked(worktree_list).mockReturnValue([]);
            const { lastFrame, unmount } = render(<Dashboard repoRoot="/tmp/repo" />);
            expect(lastFrame()!).toContain('No active agents');
            unmount();
        });

        it('shows RUNNING when process is alive', () => {
            vi.mocked(worktree_list).mockReturnValue([
                { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
            ]);
            vi.mocked(read_state).mockReturnValue({ foo: { status: 'running', pid: 1234 } });
            vi.mocked(is_process_running).mockReturnValue(true);
            const { lastFrame, unmount } = render(<Dashboard repoRoot="/tmp/repo" />);
            expect(lastFrame()!).toContain('[RUNNING]');
            unmount();
        });

        it('shows CRASHED when process is dead', () => {
            vi.mocked(worktree_list).mockReturnValue([
                { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
            ]);
            vi.mocked(read_state).mockReturnValue({ foo: { status: 'running', pid: 1234 } });
            vi.mocked(is_process_running).mockReturnValue(false);
            const { lastFrame, unmount } = render(<Dashboard repoRoot="/tmp/repo" />);
            expect(lastFrame()!).toContain('[CRASHED]');
            unmount();
        });

        it('shows LAUNCHED when no pid', () => {
            vi.mocked(worktree_list).mockReturnValue([
                { path: '/tmp/repo/.agents/agent-foo', branch: 'agent/foo', head: 'abc' },
            ]);
            vi.mocked(read_state).mockReturnValue({ foo: { status: 'running' } });
            const { lastFrame, unmount } = render(<Dashboard repoRoot="/tmp/repo" />);
            expect(lastFrame()!).toContain('[LAUNCHED]');
            unmount();
        });
    });

    describe('run', () => {
        it('exits when not in a git repo', () => {
            const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
            run();
            expect(exitSpy).toHaveBeenCalledWith(1);
            exitSpy.mockRestore();
            errorSpy.mockRestore();
        });
    });
});
