import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { fileURLToPath, pathToFileURL } from 'node:url';

import { dispatch, COMMAND_NAMES, is_main_module } from '../index.ts';
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

describe('is_main_module (the process-entry guard)', () => {
    it('matches an entry path even when it contains a space/special char', () => {
        // The old hand-built `file://${entry}` form fails here: import.meta.url percent-encodes (space
        // → %20) but the manual form does not, so a published install under a spaced path was a no-op.
        const spaced = '/tmp/My Projects/x/dist/index.js';
        expect(is_main_module(pathToFileURL(spaced).href, spaced)).toBe(true);
        expect(pathToFileURL(spaced).href).not.toBe(`file://${spaced}`);
    });

    it('returns false for a different entry or an undefined entry', () => {
        expect(is_main_module(pathToFileURL('/a/b.js').href, '/a/other.js')).toBe(false);
        expect(is_main_module('file:///a/b.js', undefined)).toBe(false);
    });
});

describe('dispatch (AC-004/014)', () => {
    it('advertised commands equal the dispatchable set (no command resolves to Unknown)', () => {
        expect(new Set(COMMAND_CATALOG.map((c) => c.name))).toEqual(new Set([...COMMAND_NAMES, 'help']));
    });

    it('the Commands/useCases files equal the catalog (a command file cannot exist unadvertised)', () => {
        // The third parity leg: catalog↔dispatcher above is only half the invariant — a run() file
        // sitting in Commands/useCases that neither names covers would ship dead (or worse,
        // reachable-but-unadvertised) code. Every file except the known non-commands must map
        // 1:1 onto a catalog name (camelCase file → kebab-case command, e.g. checkMyWork).
        const NON_COMMANDS = new Set(['catalog.ts', 'index.ts']); // the catalog itself + the barrel
        const useCasesDir = fileURLToPath(new URL('../modules/Commands/useCases', import.meta.url));
        const fromFiles = readdirSync(useCasesDir)
            .filter((entry) => entry.endsWith('.ts') && !NON_COMMANDS.has(entry))
            .map((entry) => entry.replace(/\.ts$/, '').replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`));
        expect(new Set(fromFiles)).toEqual(new Set(COMMAND_CATALOG.map((c) => c.name)));
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
        expect(version.out).toMatch(/^suspec \d+\.\d+\.\d+/);
        expect((await capture(() => dispatch(['-v']))).out).toContain('suspec ');
    });

    it('<command> --help prints that command’s usage and does not run the command', async () => {
        const help = await capture(() => dispatch(['check', '--help']));
        expect(help.code).toBe(0);
        expect(help.out).toContain('suspec check');
        expect(help.out).toContain('Usage');
        const worktree = await capture(() => dispatch(['worktree', '-h']));
        expect(worktree.code).toBe(0);
        expect(worktree.out).toContain('create');
    });

    it('no args, non-TTY → prints help, exit 0', async () => {
        const { code, out } = await capture(() => dispatch([]));
        expect(code).toBe(0);
        expect(out).toContain('suspec');
    });

    it('an unknown command → stderr + exit 2', async () => {
        const { code, err } = await capture(() => dispatch(['frobnicate']));
        expect(code).toBe(2);
        expect(err).toContain('Unknown command');
    });

    it('routes to a command (status over a store-less repo)', async () => {
        const ws = mkdtempSync(join(tmpdir(), 'suspec-dispatch-'));
        const savedStateDir = process.env.SUSPEC_STATE_DIR;
        process.env.SUSPEC_STATE_DIR = join(ws, 'state');
        try {
            const { code, out } = await capture(() => dispatch(['status'], ws));
            expect(code).toBe(0);
            expect(out).toContain('no store for this repo yet');
        } finally {
            if (savedStateDir === undefined) {
                delete process.env.SUSPEC_STATE_DIR;
            } else {
                process.env.SUSPEC_STATE_DIR = savedStateDir;
            }
            rmSync(ws, { recursive: true, force: true });
        }
    });
});
