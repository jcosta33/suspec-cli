import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { run } from '../useCases/lint.ts';

const CLEAN = `---
type: spec
id: ok
swarm_language: SOL/0.1
spec_version: 0.1.0
---

## Obligations

REQ AC-001:
WHEN a request arrives
THE system MUST respond
VERIFY BY test:cmdTest:t#a
`;

// REQ with a C- id -> SOL-S005 (prefix mismatch).
const MALFORMED = `---
type: spec
id: bad
swarm_language: SOL/0.1
spec_version: 0.1.0
---

## Obligations

REQ C-001:
THE system MUST respond
VERIFY BY test:cmdTest:t#a
`;

function write_temp(name: string, content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'swarm-lint-'));
    const file = join(dir, name);
    writeFileSync(file, content, 'utf8');
    return file;
}

function with_argv<TReturn>(args: string[], fn: () => TReturn): TReturn {
    const original = process.argv;
    process.argv = ['node', 'lint.ts', ...args];
    try {
        return fn();
    } finally {
        process.argv = original;
    }
}

describe('swarm lint', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
        logSpy.mockRestore();
        errSpy.mockRestore();
    });

    it('returns 2 with no file argument', () => {
        expect(with_argv([], run)).toBe(2);
    });

    it('returns 0 and reports clean for a well-formed spec', () => {
        const file = write_temp('ok.swarm.md', CLEAN);
        expect(with_argv([file], run)).toBe(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('clean');
    });

    it('returns 1 and reports the SOL code for a malformed spec', () => {
        const file = write_temp('bad.swarm.md', MALFORMED);
        expect(with_argv([file], run)).toBe(1);
        const out = [...logSpy.mock.calls, ...errSpy.mock.calls].flat().join('\n');
        expect(out).toContain('SOL-S005');
    });

    it('returns 1 when the file does not exist', () => {
        expect(with_argv(['/no/such/file.swarm.md'], run)).toBe(1);
    });
});
