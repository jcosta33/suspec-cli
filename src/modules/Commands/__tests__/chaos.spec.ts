import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/chaos.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

describe('chaos', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1 for unknown command', () => {
        process.argv = ['node', 'script', 'unknown'];
        expect(run()).toBe(1);
    });

    it('injects chaos env vars', () => {
        process.argv = ['node', 'script', 'start'];
        expect(run()).toBe(0);
    });

    it('stops chaos monkey', () => {
        process.argv = ['node', 'script', 'stop'];
        expect(run()).toBe(0);
    });
});
