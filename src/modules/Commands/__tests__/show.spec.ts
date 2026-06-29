import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { run } from '../useCases/show.ts';

// `suspec show <kind> [ref] [--json]` — the read-only loader command. Mirrors status.spec: build a
// minimal workspace, drive run(), assert the projected JSON + the exit posture (0 clean · 2 error).

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - self
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a-test

## Non-goals

- none.

## Open questions

- none.
`;
const TASK = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001]
status: ready
---

# Task

## Affected areas

- \`src/feat\`
`;

let ws: string;
beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'suspec-show-cmd-'));
    mkdirSync(join(ws, 'specs', 'feat'), { recursive: true });
    mkdirSync(join(ws, 'tasks'), { recursive: true });
    writeFileSync(join(ws, 'specs', 'feat', 'spec.md'), SPEC);
    writeFileSync(join(ws, 'tasks', 'feat.md'), TASK);
});
afterEach(() => rmSync(ws, { recursive: true, force: true }));

function capture(fn: () => number): { out: string; code: number } {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        out.push(String(chunk));
        return true;
    });
    try {
        const code = fn();
        return { out: out.join(''), code };
    } finally {
        spy.mockRestore();
    }
}

describe('suspec show command', () => {
    it('checks --json → exit 0, emits {kind:checks} with version + checks', () => {
        const { out, code } = capture(() => run(['checks', '--json'], ws));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.kind).toBe('checks');
        expect(parsed.value.checks.length).toBeGreaterThan(0);
    });

    it('task <stem> --json → exit 0, emits the parsed packet', () => {
        const { out, code } = capture(() => run(['task', 'feat', '--json'], ws));
        expect(code).toBe(0);
        const parsed = JSON.parse(out);
        expect(parsed.kind).toBe('task');
        expect(parsed.value.id).toBe('TASK-feat');
        expect(parsed.value.scope).toEqual(['AC-001']);
    });

    it('spec by id --json → exit 0', () => {
        const { code } = capture(() => run(['spec', 'SPEC-feat', '--json'], ws));
        expect(code).toBe(0);
    });

    it('a missing task → exit 2 (the error posture)', () => {
        const { code } = capture(() => run(['task', 'does-not-exist', '--json'], ws));
        expect(code).toBe(2);
    });

    it('an unknown kind → exit 2', () => {
        const { code } = capture(() => run(['bogus', '--json'], ws));
        expect(code).toBe(2);
    });

    it('non-json mode renders the parsed value as readable JSON', () => {
        const { out, code } = capture(() => run(['task', 'feat'], ws));
        expect(code).toBe(0);
        expect(out).toContain('TASK-feat'); // pretty-printed value
    });
});
