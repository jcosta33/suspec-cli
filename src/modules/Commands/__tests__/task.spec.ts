import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/task.ts';
import { writeFileSync, mkdirSync } from 'fs';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), prompt_input: vi.fn() };
});

import { prompt_input } from '../../Terminal/useCases/index.ts';

describe('task', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mkdirSync('/tmp/repo/.agents/tasks', { recursive: true });
        writeFileSync('/tmp/repo/.agents/tasks/foo.md', '# Task\n', 'utf8');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when slug is missing', async () => {
        process.argv = ['node', 'script'];
        expect(await run()).toBe(1);
    });

    it('returns 1 when task file not found', async () => {
        process.argv = ['node', 'script', 'bar'];
        expect(await run()).toBe(1);
    });

    it('returns 1 when no note provided', async () => {
        vi.mocked(prompt_input).mockResolvedValue('');
        process.argv = ['node', 'script', 'foo'];
        expect(await run()).toBe(1);
    });

    it('appends note successfully', async () => {
        vi.mocked(prompt_input).mockResolvedValue('This is a test note');
        process.argv = ['node', 'script', 'foo'];
        expect(await run()).toBe(0);
    });
});
