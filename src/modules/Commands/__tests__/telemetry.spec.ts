import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { aggregateMetrics, run } from '../useCases/telemetry.ts';

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        green: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
        bold: vi.fn((t: string) => t),
        dim: vi.fn((t: string) => t),
    };
});

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => '{}'),
    };
});

import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, readFileSync } from 'fs';

describe('telemetry module', () => {
    describe('aggregateMetrics', () => {
        it('counts active agents', () => {
            const result = aggregateMetrics({ a: { status: 'running' }, b: { status: 'done' } });
            expect(result.activeCount).toBe(1);
            expect(result.completedCount).toBe(1);
        });

        it('counts crashed agents', () => {
            const result = aggregateMetrics({ a: { status: 'crashed' } });
            expect(result.crashedCount).toBe(1);
        });

        it('ignores non-agent info', () => {
            const result = aggregateMetrics({ a: 'string', b: { status: 'running' } });
            expect(result.activeCount).toBe(1);
        });
    });

    describe('run', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns 1 when not in a git repo', () => {
            vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
            expect(run()).toBe(1);
        });

        it('returns 0 when no state file', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(existsSync).mockReturnValue(false);
            expect(run()).toBe(0);
        });

        it('returns 0 when state is empty', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('{}');
            expect(run()).toBe(0);
        });

        it('returns 0 with metrics', () => {
            vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
            vi.mocked(existsSync).mockReturnValue(true);
            vi.mocked(readFileSync).mockReturnValue('{"a": {"status": "running"}, "b": {"status": "done"}, "c": {"status": "crashed"}}');
            expect(run()).toBe(0);
        });
    });
});
