import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { dispatch, COMMAND_NAMES } from '../index.ts';
import { COMMAND_CATALOG } from '../modules/Commands/useCases/catalog.ts';

async function capture(fn: () => Promise<number>): Promise<{ out: string; err: string; code: number }> {
    const out: string[] = [];
    const errs: string[] = [];
    const o = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    const e = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
        errs.push(String(chunk));
        return true;
    });
    try {
        const code = await fn();
        return { out: out.join(''), err: errs.join(''), code };
    } finally {
        o.mockRestore();
        e.mockRestore();
    }
}

describe('dispatch (AC-004/014)', () => {
    it('advertised commands equal the dispatchable set (no command resolves to Unknown)', () => {
        expect(new Set(COMMAND_CATALOG.map((c) => c.name))).toEqual(new Set([...COMMAND_NAMES, 'help']));
    });

    it('--help and help print the reference, exit 0', async () => {
        expect((await capture(() => dispatch(['--help']))).code).toBe(0);
        const help = await capture(() => dispatch(['help']));
        expect(help.code).toBe(0);
        expect(help.out).toContain('Commands');
    });

    it('--version / -v prints the version, exit 0', async () => {
        const version = await capture(() => dispatch(['--version']));
        expect(version.code).toBe(0);
        expect(version.out).toMatch(/^swarm \d+\.\d+\.\d+/);
        expect((await capture(() => dispatch(['-v']))).out).toContain('swarm ');
    });

    it('<command> --help prints that command’s usage and does not run the command', async () => {
        const help = await capture(() => dispatch(['check', '--help']));
        expect(help.code).toBe(0);
        expect(help.out).toContain('swarm check');
        expect(help.out).toContain('Usage');
        const worktree = await capture(() => dispatch(['worktree', '-h']));
        expect(worktree.code).toBe(0);
        expect(worktree.out).toContain('create');
    });

    it('no args, non-TTY → prints help, exit 0', async () => {
        const { code, out } = await capture(() => dispatch([]));
        expect(code).toBe(0);
        expect(out).toContain('swarm');
    });

    it('an unknown command → stderr + exit 2', async () => {
        const { code, err } = await capture(() => dispatch(['frobnicate']));
        expect(code).toBe(2);
        expect(err).toContain('Unknown command');
    });

    it('routes to a command (status over a workspace)', async () => {
        const ws = mkdtempSync(join(tmpdir(), 'swarm-dispatch-'));
        try {
            mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
            writeFileSync(join(ws, 'specs', 'x', 'spec.md'), '---\ntype: spec\nid: SPEC-x\nstatus: ready\n---\n');
            const { code, out } = await capture(() => dispatch(['status'], ws));
            expect(code).toBe(0);
            expect(out).toContain('SPEC-x');
        } finally {
            rmSync(ws, { recursive: true, force: true });
        }
    });
});
