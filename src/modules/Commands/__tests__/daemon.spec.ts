import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../useCases/daemon.ts';

vi.mock('../../Workspace/useCases/index.ts', () => ({
    get_repo_root: vi.fn(() => '/tmp/repo'),
}));

const mockWatcherClose = vi.fn();

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        statSync: vi.fn(() => ({ isDirectory: () => false })),
        readdirSync: vi.fn(() => []),
        watch: vi.fn((_path: unknown, cb: unknown) => {
            // Because watchRecursive calls watch with 2 arguments (path, listener)
            const listener = typeof cb === 'function' ? cb : _path;
            if (typeof listener === 'function') {
                (globalThis as Record<string, unknown>).__daemonWatcherCallback = listener;
            }
            return { close: mockWatcherClose };
        }),
    };
});

const mockKill = vi.fn();
let mockCloseHandler: ((code: number | null) => void) | null = null;

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawn: vi.fn(() => ({
            pid: 123,
            kill: mockKill,
            on: vi.fn((event: string, cb: (code: number | null) => void) => {
                if (event === 'close') {
                    mockCloseHandler = cb;
                }
            }),
        })),
    };
});

vi.mock('../../Terminal/useCases/index.ts', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...(actual as object),
        parse_args: vi.fn(() => ({ positional: [], flags: new Map() })),
        red: vi.fn((t: string) => t),
        cyan: vi.fn((t: string) => t),
        dim: vi.fn((t: string) => t),
        yellow: vi.fn((t: string) => t),
    };
});

import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { spawn } from 'child_process';

describe('daemon', () => {
    const sigintHandlers: (() => void)[] = [];
    const sigtermHandlers: (() => void)[] = [];

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(get_repo_root).mockReturnValue('/tmp/repo');
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();
        mockKill.mockClear();
        mockWatcherClose.mockClear();
        mockCloseHandler = null;

        // Intercept process.on to track SIGINT/SIGTERM listeners for cleanup
        const originalOn = process.on.bind(process);
        vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: (...args: unknown[]) => void) => {
            if (event === 'SIGINT') sigintHandlers.push(listener);
            if (event === 'SIGTERM') sigtermHandlers.push(listener);
            return originalOn(event, listener);
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        sigintHandlers.forEach((h) => process.removeListener('SIGINT', h));
        sigtermHandlers.forEach((h) => process.removeListener('SIGTERM', h));
        sigintHandlers.length = 0;
        sigtermHandlers.length = 0;
    });

    it('returns 1 when not in a git repo', () => {
        vi.mocked(get_repo_root).mockImplementation(() => { throw new Error('not a repo'); });
        process.argv = ['node', 'script'];
        expect(run()).toBe(1);
    });

    it('starts daemon successfully', () => {
        process.argv = ['node', 'script'];
        expect(run()).toBe(0);
    });

    it('ignores non-ts file changes', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'README.md');
        vi.advanceTimersByTime(1100);
        expect(spawn).not.toHaveBeenCalled();
    });

    it('ignores spec file changes', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.spec.ts');
        vi.advanceTimersByTime(1100);
        expect(spawn).not.toHaveBeenCalled();
    });

    it('triggers on ts file changes', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.ts');
        vi.advanceTimersByTime(1100);
        expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('debounces rapid file changes', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) {
            cb('change', 'a.ts');
            cb('change', 'b.ts');
            cb('change', 'c.ts');
        }
        vi.advanceTimersByTime(500);
        expect(spawn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(600);
        expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('kills previous process when new change arrives', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'first.ts');
        vi.advanceTimersByTime(1100);
        expect(spawn).toHaveBeenCalledTimes(1);
        expect(mockKill).not.toHaveBeenCalled();

        if (cb) cb('change', 'second.ts');
        vi.advanceTimersByTime(1100);
        expect(spawn).toHaveBeenCalledTimes(2);
        expect(mockKill).toHaveBeenCalledTimes(1);
    });

    it('logs success when radius check passes', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.ts');
        vi.advanceTimersByTime(1100);
        expect(mockCloseHandler).not.toBeNull();
        if (mockCloseHandler) mockCloseHandler(0);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('passed'));
    });

    it('logs failure when radius check fails', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.ts');
        vi.advanceTimersByTime(1100);
        expect(mockCloseHandler).not.toBeNull();
        if (mockCloseHandler) mockCloseHandler(1);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('FAILED'));
    });

    it('does not log when process is killed (null code)', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.ts');
        vi.advanceTimersByTime(1100);
        expect(mockCloseHandler).not.toBeNull();
        if (mockCloseHandler) mockCloseHandler(null);
        const radiusCalls = logSpy.mock.calls.filter((c) => c[0] && String(c[0]).includes('Radius check'));
        expect(radiusCalls.length).toBe(0);
    });

    it('ignores watcher events with null filename', () => {
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string | null) => void;
        if (cb) cb('change', null);
        vi.advanceTimersByTime(1100);
        expect(spawn).not.toHaveBeenCalled();
    });

    it('shuts down on SIGINT', () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never);
        process.argv = ['node', 'script'];
        run();
        const cb = (globalThis as Record<string, unknown>).__daemonWatcherCallback as (event: string, filename: string) => void;
        if (cb) cb('change', 'foo.ts');
        vi.advanceTimersByTime(1100);
        expect(spawn).toHaveBeenCalledTimes(1);

        const handler = sigintHandlers[sigintHandlers.length - 1];
        if (handler) handler();
        expect(mockWatcherClose).toHaveBeenCalled();
        expect(mockKill).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
        exitSpy.mockRestore();
    });
});
