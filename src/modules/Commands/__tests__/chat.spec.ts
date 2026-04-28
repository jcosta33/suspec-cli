import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/chat.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    appendFileSync: vi.fn(),
}));

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    read_state: vi.fn(() => ({ foo: { status: 'running' } })),
}));

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...(actual as object), logger: { info: vi.fn(), error: vi.fn(), raw: vi.fn() } };
});

describe('chat', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation((...args) => {
            // console.warn('TEST ERROR LOG:', ...args);
        });
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when slug is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('reads chat log when no message flag', () => {
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(0);
    });

    it('sends chat message with --message flag', () => {
        process.argv = ['node', 'script', 'foo', '--message', 'hello world'];
        expect(run()).toBe(0);
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('uses --from flag for mySlug', () => {
        process.argv = ['node', 'script', 'foo', '--from', 'reviewer'];
        expect(run()).toBe(0);
    });
});
