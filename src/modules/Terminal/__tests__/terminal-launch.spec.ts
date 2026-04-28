import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { launch, strip_flag, posix_quote } from '../useCases/terminal.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

vi.mock('../../AgentState/useCases/index.ts', () => ({
    write_state: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('child_process')>();
    return {
        ...actual,
        spawnSync: vi.fn(),
        spawn: vi.fn(() => ({ pid: 123, unref: vi.fn() })),
    };
});

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    };
});

import { spawnSync } from 'child_process';
import { write_state } from '../../AgentState/useCases/index.ts';

describe('terminal launch', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('launch current backend returns exit code', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, error: null } as ReturnType<typeof spawnSync>);
        const result = launch('current', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBe(0);
        expect(write_state).toHaveBeenCalled();
    });

    it('launch current writes failed state on error', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 1, error: new Error('fail') } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, error: null } as ReturnType<typeof spawnSync>);
        launch('current', '/wt', 'cmd', ['--name', 's', '--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(write_state).toHaveBeenCalledWith('/repo', 's', expect.objectContaining({ status: 'failed' }));
    });

    it('launch current retries without --name on error', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 1, error: new Error('fail') } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, error: null } as ReturnType<typeof spawnSync>);
        const result = launch('current', '/wt', 'cmd', ['--name', 's', '--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBe(0);
    });

    it('launch current returns error when retry also fails', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 1, error: new Error('fail') } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 1, error: new Error('fail2') } as ReturnType<typeof spawnSync>);
        const result = launch('current', '/wt', 'cmd', ['--name', 's'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        const err = assertErr(result);
        expect(err._tag).toBe('TerminalLaunchFailed');
        expect(err.message).toContain('Failed to launch cmd');
    });

    it('launch current returns error when no --name to strip', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 1, error: new Error('fail') } as ReturnType<typeof spawnSync>);
        const result = launch('current', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        const err = assertErr(result);
        expect(err._tag).toBe('TerminalLaunchFailed');
        expect(err.message).toContain('Failed to launch cmd');
    });

    it('launch current skips write_state when no repoRoot', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, error: null } as ReturnType<typeof spawnSync>);
        launch('current', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '');
        expect(write_state).not.toHaveBeenCalled();
    });

    it('launch terminal backend returns undefined', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as ReturnType<typeof spawnSync>);
        const result = launch('terminal', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBeUndefined();
    });

    it('launch terminal backend falls back to current on error', () => {
        vi.mocked(spawnSync)
            .mockReturnValueOnce({ status: 1, stderr: 'AppleScript error' } as ReturnType<typeof spawnSync>)
            .mockReturnValueOnce({ status: 0, error: null } as ReturnType<typeof spawnSync>);
        const result = launch('terminal', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBe(0); // Returned from fallback
    });

    it('launch iterm backend returns undefined', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as ReturnType<typeof spawnSync>);
        const result = launch('iterm', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBeUndefined();
    });

    it('launch linux-auto backend returns undefined', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as ReturnType<typeof spawnSync>);
        const result = launch('linux-auto', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBeUndefined();
    });

    it('launch windows-auto backend returns undefined', () => {
        vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as ReturnType<typeof spawnSync>);
        const result = launch('windows-auto', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        expect(assertOk(result)).toBeUndefined();
    });

    it('launch returns error on unsupported backend', () => {
        const result = launch('unknown', '/wt', 'cmd', ['--arg'], { title: 'T', slug: 's', branch: 'b', taskFile: 'f', agent: 'a' }, '/repo');
        const err = assertErr(result);
        expect(err._tag).toBe('TerminalLaunchFailed');
        expect(err.message).toContain('Unsupported terminal backend');
    });

    describe('strip_flag', () => {
        it('removes flag and value', () => {
            expect(strip_flag('--name', ['--name', 'val', '--other'])).toEqual(['--other']);
        });
        it('returns unchanged when flag missing', () => {
            expect(strip_flag('--name', ['--other'])).toEqual(['--other']);
        });
    });

    describe('posix_quote', () => {
        it('wraps string in single quotes', () => {
            expect(posix_quote('hello')).toBe("'hello'");
        });
        it('escapes single quotes', () => {
            expect(posix_quote("it's")).toBe("'it'\\''s'");
        });
    });
});