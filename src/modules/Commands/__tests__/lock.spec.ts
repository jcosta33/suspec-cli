import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/lock.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('../../AgentState/useCases/index.ts', () => ({
    claim_lock: vi.fn(() => ({ ok: true, value: true })),
    release_lock: vi.fn(() => ({ ok: true, value: true })),
    list_locks: vi.fn(() => []),
}));

import { list_locks } from '../../AgentState/useCases/index.ts';

describe('lock', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 when subcommand is missing', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('claims lock successfully', () => {
        process.argv = ['node', 'script', 'claim', 'file.ts', '--agent', 'test'];
        expect(run()).toBe(0);
    });

    it('returns 1 when claim files are missing', () => {
        process.argv = ['node', 'script', 'claim', '--agent', 'test'];
        expect(run()).toBe(1);
    });

    it('returns 1 when claim agent is missing', () => {
        process.argv = ['node', 'script', 'claim', 'file.ts'];
        expect(run()).toBe(1);
    });

    it('releases lock successfully', () => {
        process.argv = ['node', 'script', 'release', 'file.ts'];
        expect(run()).toBe(0);
    });

    it('returns 1 when release file is missing', () => {
        process.argv = ['node', 'script', 'release'];
        expect(run()).toBe(1);
    });

    it('lists locks when empty', () => {
        process.argv = ['node', 'script', 'list'];
        expect(run()).toBe(0);
    });

    it('lists active locks', () => {
        vi.mocked(list_locks).mockReturnValue([
            { agent_slug: 'a', files: ['f.ts'], claimed_at: '2024-01-01', expires_at: '2024-01-02' },
        ]);
        process.argv = ['node', 'script', 'list'];
        expect(run()).toBe(0);
    });

    it('returns 1 for unknown subcommand', () => {
        process.argv = ['node', 'script', 'unknown'];
        expect(run()).toBe(1);
    });
});
