import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'node:url';

import { dispatch, is_main_module, COMMAND_NAMES } from '../index.ts';
import { COMMAND_CATALOG } from '../modules/Commands/useCases/index.ts';

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

const CONFORMANT = `---
type: spec
id: SPEC-x
status: ready
sources:
  - ADR-0077
---

## Intent

Exercise command dispatch.

## Requirements

### AC-001 — does it
The tool must do it.
Verify with: a test.

## Non-goals

- nope.

## Open questions

- none
`;

describe('dispatch — the single-verb router (ADR-0143)', () => {
    it('the dispatchable surface is exactly the check verb', () => {
        expect(COMMAND_NAMES).toEqual(['check']);
        // the catalog and the dispatcher name the same surface — neither drifts alone
        expect(COMMAND_NAMES).toEqual(COMMAND_CATALOG.map((entry) => entry.name));
    });

    it('no args → prints usage (exit 0), never an interactive shell', async () => {
        const { code, out } = await capture(() => dispatch([]));
        expect(code).toBe(0);
        expect(out).toContain('suspec check <artifact>');
        expect(out).toContain('--contract');
    });

    it.each(['help', '--help', '-h'])('`suspec %s` prints usage (exit 0)', async (flag) => {
        const { code, out } = await capture(() => dispatch([flag]));
        expect(code).toBe(0);
        expect(out).toContain('suspec check <artifact>');
    });

    it.each(['--version', '-v'])('`suspec %s` prints the package version', async (flag) => {
        const { code, out } = await capture(() => dispatch([flag]));
        expect(code).toBe(0);
        expect(out).toMatch(/^suspec \d+\.\d+\.\d+/);
    });

    it('an unknown command → stderr + exit 2', async () => {
        const { code, err } = await capture(() => dispatch(['garden']));
        expect(code).toBe(2);
        expect(err).toContain('Unknown command: garden');
    });

    it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__'])(
        '`suspec %s` is an unknown command — an Object.prototype name never resolves through the chain',
        async (name) => {
            const { code, err } = await capture(() => dispatch([name]));
            expect(code).toBe(2);
            expect(err).toContain(`Unknown command: ${name}`);
        }
    );

    it('`suspec check --help` prints usage (exit 0)', async () => {
        const { code, out } = await capture(() => dispatch(['check', '--help']));
        expect(code).toBe(0);
        expect(out).toContain('--contract');
    });

    it('routes `check` to the check command (a conformant spec → exit 0)', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'suspec-dispatch-'));
        try {
            const file = join(dir, 'spec.md');
            writeFileSync(file, CONFORMANT);
            const { code, out } = await capture(() => dispatch(['check', file]));
            expect(code).toBe(0);
            expect(out).toContain('clean');
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('a `-h` after the `--` end-of-options marker is a positional, not a help request', async () => {
        const { code, err } = await capture(() => dispatch(['check', '--', '-h']));
        expect(code).toBe(2); // treated as a (missing) file, not help
        expect(err).toContain('file not found');
    });
});

describe('is_main_module', () => {
    it('matches when the module URL equals the entry URL, including percent-encoded paths', () => {
        const entry = '/tmp/has space/cli.js';
        expect(is_main_module(pathToFileURL(entry).href, entry)).toBe(true);
    });

    it('does not match a different entry or an undefined one', () => {
        expect(is_main_module(pathToFileURL('/tmp/a.js').href, '/tmp/b.js')).toBe(false);
        expect(is_main_module(pathToFileURL('/tmp/a.js').href, undefined)).toBe(false);
    });
});
