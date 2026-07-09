import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ADR-0084 D3 / ADR-0137 — THE LOAD-BEARING INVARIANT, sharpened by the board's retirement: no
// suspec-cli command writes `status.md` or any board state; in v2 there IS no board — the store is
// the state of record and `suspec status` derives its summary from it. This boundary regression
// test makes the no-board-write property an invariant, not a convention — it asserts the write-set
// of EVERY use-case layer (Commands, Sol, Core, Workspace, Tui) excludes the board entirely: since
// the board's retirement, NO use-case may even name a `status.md` path.
//
// Match (gap narrowed, not fully closed): a static scan reads source text, so it cannot resolve a
// path assembled at runtime from variables (or a name built by string concatenation). It DOES
// catch `status.md` whether written as a quoted literal (`'status.md'`), a bare segment passed to
// `join(...)`, or a word token near a write call — the realistic ways a board write would be
// spelled.

// The scan covers EVERY production source under src/ — all six modules (useCases AND their private
// services/models/repositories dirs), src/index.ts, and src/infra — not the useCases layers alone:
// a board write wired into a service (or the dispatcher itself) must fail this just as loudly.
const srcRoot = fileURLToPath(new URL('../../..', import.meta.url));
const EXCLUDED_DIRS = new Set(['__tests__', 'testing']);

function source_files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (!EXCLUDED_DIRS.has(entry)) {
                out.push(...source_files(full));
            }
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

// `status.md` named any of the realistic ways: a quoted literal, a bare segment passed to a path
// builder, or a bare `status.md` word token.
const STATUS_MD = /\bstatus\.md\b/;

describe('the no-board invariant (ADR-0084 D3, retired board — ADR-0137)', () => {
    const files = source_files(srcRoot);

    it('finds the production sources across every module, the dispatcher, and infra', () => {
        // Every surface a write could be wired into must contribute files — the six modules
        // (Terminal and the services dirs included), the dispatcher, and infra.
        for (const layer of ['Commands', 'Sol', 'Core', 'Workspace', 'Tui', 'Terminal'] as const) {
            expect(
                files.some((file) => file.includes(join('modules', layer))),
                `modules/${layer} must contribute source files to the scan`
            ).toBe(true);
        }
        expect(files.some((file) => file.endsWith(join('src', 'index.ts')))).toBe(true);
        expect(files.some((file) => file.includes(join('src', 'infra')))).toBe(true);
        expect(files.some((file) => file.includes('/services/'))).toBe(true);
        expect(files.length).toBeGreaterThan(100);
    });

    it('NO production source names a `status.md` path — the board is gone, not merely unwritten', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            expect(STATUS_MD.test(text), `${file} must not reference a status.md board path`).toBe(false);
        }
    });
});
