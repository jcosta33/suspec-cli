import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/check.ts';

const CONFORMANT = `---
type: spec
id: SPEC-x
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — does it
The tool must do it.
Verify with: a test.

## Non-goals

- nope.

## Open questions

- none
`;

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-check-cmd-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

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

function writeSpec(name: string, content: string): string {
    const path = join(dir, `${name}.md`);
    writeFileSync(path, content);
    return path;
}

describe('check command (direct surface, AC-001/005)', () => {
    it('lints a conformant spec file → exit 0', async () => {
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file]));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });

    it('a spec missing a Verify line → exit 2', async () => {
        const file = writeSpec('bad', CONFORMANT.replace('Verify with: a test.', ''));
        const { code } = await capture(() => run([file]));
        expect(code).toBe(2);
    });

    it('a missing file → exit 2 with a message on stderr', async () => {
        const { code, err } = await capture(() => run([join(dir, 'nope.md')]));
        expect(code).toBe(2);
        expect(err).toContain('file not found');
    });

    it('a directory arg → exit 2 with a clean message, not an EISDIR crash', async () => {
        mkdirSync(join(dir, 'specs', 'feature'), { recursive: true });
        const { code, err } = await capture(() => run([join(dir, 'specs', 'feature')]));
        expect(code).toBe(2);
        expect(err).toContain('it is a directory');
    });

    it('--json emits machine output that parses', async () => {
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean', diagnostics: [] });
    });

    it('resolves a workspace ref relative to the spec file (C009) → exit 2 when missing', async () => {
        const file = writeSpec('refs', CONFORMANT.replace('  - ADR-0077', '  - ADR-0077\n  - ./missing.md'));
        const { code } = await capture(() => run([file]));
        expect(code).toBe(2);
    });

    it('--no-workspace lints the specs but skips workspace-validity (placeholder/templates)', async () => {
        mkdirSync(join(dir, 'specs', 'x'), { recursive: true });
        writeFileSync(join(dir, 'specs', 'x', 'spec.md'), CONFORMANT);
        writeFileSync(join(dir, 'AGENTS.md'), 'guide with a {{placeholder}}\n'); // no templates/ dir either
        // bare check is blocked by the workspace-validity findings…
        expect((await capture(() => run([], dir))).code).toBe(2);
        // …but --no-workspace skips them and lints the (clean) spec
        const relaxed = await capture(() => run(['--no-workspace'], dir));
        expect(relaxed.code).toBe(0);
    });

    it('bare check renders the workspace verdict over the cwd', async () => {
        mkdirSync(join(dir, 'specs', 'x'), { recursive: true });
        mkdirSync(join(dir, 'templates'), { recursive: true }); // a valid workspace (checks.md clause b)
        writeFileSync(join(dir, 'specs', 'x', 'spec.md'), CONFORMANT);
        const clean = await capture(() => run([], dir));
        expect(clean.code).toBe(0);

        writeFileSync(join(dir, 'specs', 'x', 'spec.md'), CONFORMANT.replace('Verify with: a test.', ''));
        const blocking = await capture(() => run([], dir));
        expect(blocking.code).toBe(2);
    });
});

// AC-015: the interactive surface never engages when output is machine-bound (`--json`) or piped
// (no TTY); the same guard protects every command, exercised here on `check` as the representative.
describe('check never engages the TUI under --json or a non-TTY (AC-015)', () => {
    const originalIsTTY = process.stdout.isTTY;
    afterEach(() => {
        process.stdout.isTTY = originalIsTTY;
    });

    it('-i with --json takes the direct path on a TTY (emits JSON, no prompt)', async () => {
        process.stdout.isTTY = true;
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '-i', '--json']));
        expect(code).toBe(0);
        expect(JSON.parse(out)).toMatchObject({ level: 'clean' });
    });

    it('-i without a TTY takes the direct path (renders text, no prompt)', async () => {
        process.stdout.isTTY = false;
        const file = writeSpec('ok', CONFORMANT);
        const { code, out } = await capture(() => run([file, '-i']));
        expect(code).toBe(0);
        expect(out).toContain('clean');
    });
});
