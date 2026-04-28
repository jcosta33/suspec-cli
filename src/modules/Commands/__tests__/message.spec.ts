import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/message.ts';

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

describe('message', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when slug is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('returns 1 when payload is missing', () => {
        process.argv = ['node', 'script', 'foo'];
        expect(run()).toBe(1);
    });

    it('returns 1 for invalid JSON', () => {
        process.argv = ['node', 'script', 'foo', 'not-json'];
        expect(run()).toBe(1);
    });

    it('queues message successfully', () => {
        process.argv = ['node', 'script', 'foo', '{"type":"pause"}'];
        expect(run()).toBe(0);
    });
});
