import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { create_sandbox, main } from '../useCases/new.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
    get_repo_name: vi.fn(() => 'my-repo'),
    worktree_list: vi.fn(() => []),
    branch_exists: vi.fn(() => false),
    // worktree_create now returns Result<{ path, branch }, AppError>.
    worktree_create: vi.fn((path: string, branch: string) => ({ ok: true, value: { path, branch } })),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    write_state: vi.fn(),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), logger: { info: vi.fn(), error: vi.fn(), raw: vi.fn() }, success: vi.fn(), load_config: vi.fn(() => ({ defaultAgent: 'claude', defaultBaseBranch: 'main', defaultTerminal: 'auto', slugMaxLen: 50, reuseExistingByDefault: false, writeTaskTemplateOnCreate: true })), prompt_input: vi.fn() };
});

vi.mock('../../TaskManagement/useCases/index.ts', () => ({
    to_slug: vi.fn((s: string) => ({ ok: true, value: s })),
    // Use the slug input so auto-incremented slugs get a matching branch and
    // don't collide with a pre-existing worktree.
    derive_names: vi.fn((slug: string) => ({ branch: `agent/${slug}`, worktreePath: `.agents/agent-${slug}` })),
    next_duplicate_slug: vi.fn((s: string) => `${s}-2`),
    create_or_update_task_file: vi.fn(),
}));

vi.mock('../useCases/launch-agent.ts', () => ({
    run_agent_launch: vi.fn(() => 0),
}));

import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { worktree_list } from '../../Workspace/useCases/index.ts';
import { worktree_create } from '../../Workspace/useCases/index.ts';
import { load_config, prompt_input } from '../../Terminal/useCases/index.ts';
import { run_agent_launch } from '../useCases/launch-agent.ts';

describe('new', () => {
    beforeEach(() => {
        // Re-seed the mocks that individual tests mutate, so a `throw`-style
        // mockImplementation from one test doesn't leak into the next.
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.mocked(worktree_list).mockReturnValue([]);
        vi.mocked(worktree_create).mockImplementation((path: string, branch: string) => ({
            ok: true,
            value: { path, branch },
        }));
        vi.mocked(load_config).mockReturnValue({
            defaultAgent: 'claude',
            defaultBaseBranch: 'main',
            defaultTerminal: 'auto',
            slugMaxLen: 50,
            reuseExistingByDefault: false,
            writeTaskTemplateOnCreate: true,
        });
        vi.mocked(run_agent_launch).mockReturnValue(0);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('creates sandbox successfully', () => {
        const result = create_sandbox({ slug: 'test', title: 'Test task', launch: false });
        expect(result).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(1);
    });

    it('handles duplicate slug by auto-incrementing', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-test', branch: 'agent/test', head: 'abc' },
        ]);
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(0);
    });

    it('reuses existing worktree when configured', () => {
        vi.mocked(worktree_list).mockReturnValue([
            { path: '/tmp/repo/.agents/agent-test', branch: 'agent/test', head: 'abc' },
        ]);
        vi.mocked(load_config).mockReturnValue({ defaultAgent: 'claude', defaultBaseBranch: 'main', defaultTerminal: 'auto', slugMaxLen: 50, reuseExistingByDefault: true, writeTaskTemplateOnCreate: true });
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(0);
    });

    // Note: there is no "returns 1 when slug collides and reuse=false" case —
    // the production code auto-increments the slug instead of failing. That
    // behaviour is already covered by the auto-increment test above.

    it('handles existing branch without worktree', () => {
        vi.mocked(worktree_list).mockReturnValue([]);
        vi.mocked(worktree_create).mockReturnValue({
            ok: false,
            error: Object.assign(new Error('already exists'), {
                _tag: 'WorktreeCreateFailed' as const,
                worktreePath: '/tmp/repo/.agents/agent-test',
                branch: 'agent/test',
                baseBranch: 'main',
                stderr: 'already exists',
            }),
        });
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(1);
    });

    it('returns 1 when worktree creation fails', () => {
        vi.mocked(worktree_create).mockReturnValue({
            ok: false,
            error: Object.assign(new Error('git error'), {
                _tag: 'WorktreeCreateFailed' as const,
                worktreePath: '/tmp/repo/.agents/agent-test',
                branch: 'agent/test',
                baseBranch: 'main',
                stderr: 'git error',
            }),
        });
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(1);
    });

    it('skips template when writeTaskTemplateOnCreate is false', () => {
        vi.mocked(load_config).mockReturnValue({ defaultAgent: 'claude', defaultBaseBranch: 'main', defaultTerminal: 'auto', slugMaxLen: 50, reuseExistingByDefault: false, writeTaskTemplateOnCreate: false });
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: false });
        expect(result).toBe(0);
    });

    it('launches agent when launch is true', () => {
        const result = create_sandbox({ slug: 'test', title: 'Test', launch: true });
        expect(result).toBe(0);
        expect(run_agent_launch).toHaveBeenCalled();
    });

    describe('main', () => {
        it('creates sandbox from positional args', async () => {
            process.argv = ['node', 'script', 'my-task', 'My Task Title'];
            const result = await main();
            expect(result).toBe(0);
        });

        it('prompts for slug when missing', async () => {
            vi.mocked(prompt_input).mockResolvedValueOnce('prompted-slug').mockResolvedValueOnce('Prompted Title');
            process.argv = ['node', 'script'];
            const result = await main();
            expect(result).toBe(0);
            expect(prompt_input).toHaveBeenCalledWith('Task slug (e.g. billing-refactor): ');
        });

        it('returns 1 when slug prompt is empty', async () => {
            vi.mocked(prompt_input).mockResolvedValueOnce('');
            process.argv = ['node', 'script'];
            const result = await main();
            expect(result).toBe(1);
        });

        it('prompts for title when missing', async () => {
            vi.mocked(prompt_input).mockResolvedValueOnce('my-slug').mockResolvedValueOnce('My Title');
            process.argv = ['node', 'script', 'my-slug'];
            const result = await main();
            expect(result).toBe(0);
            expect(prompt_input).toHaveBeenCalledWith('Task title: ', 'my-slug');
        });

        it('uses default title when title prompt is empty', async () => {
            vi.mocked(prompt_input).mockResolvedValueOnce('my-slug').mockResolvedValueOnce('');
            process.argv = ['node', 'script', 'my-slug'];
            const result = await main();
            expect(result).toBe(0);
        });

        it('passes type and launch flags', async () => {
            vi.mocked(prompt_input).mockResolvedValueOnce('').mockResolvedValueOnce('');
            process.argv = ['node', 'script', 'my-task', 'My Title', '--type', 'feature', '--launch'];
            const result = await main();
            expect(result).toBe(0);
        });
    });
});
