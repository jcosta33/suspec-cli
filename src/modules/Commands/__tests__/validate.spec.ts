import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/validate.ts';
import { spawnSync } from 'child_process';

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), spawnSync: vi.fn() };
});

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        load_config: vi.fn(() => ({ commands: { validateDeps: 'pnpm deps:validate', typecheck: 'pnpm typecheck' } })),
        split_command: vi.fn((cmd: string) => ({ program: cmd.split(' ')[0], args: cmd.split(' ').slice(1) })),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { load_config } from '../../Terminal/useCases/index.ts';

describe('validate', () => {
    beforeEach(() => {
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('runs validation successfully', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 1 when validation fails', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: '', stderr: 'error' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('truncates long output', () => {
        const longOutput = Array(60).fill('line').join('\n');
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: longOutput, stderr: '' } as ReturnType<typeof spawnSync>);
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('returns 0 when no commands configured', () => {
        vi.mocked(load_config).mockReturnValue({ commands: {} });
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });
});
