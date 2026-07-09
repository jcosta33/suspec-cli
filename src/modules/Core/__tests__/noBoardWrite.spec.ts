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
// path assembled at runtime from variables. It DOES catch `status.md` whether written as a quoted
// literal (`'status.md'`), a bare segment passed to `join(...)`, or a word token near a write call
// — the realistic ways a board write would be spelled.

// The five layers that hold use-cases (one function per file). The scan must cover every layer a
// write could be wired into, not Core alone.
const layerDirs = (['Commands', 'Sol', 'Core', 'Workspace', 'Tui'] as const).map((layer) =>
    fileURLToPath(new URL(`../../${layer}/useCases`, import.meta.url))
);

function use_case_files(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...use_case_files(full));
        } else if (entry.endsWith('.ts') && entry !== 'index.ts') {
            out.push(full);
        }
    }
    return out;
}

// `status.md` named any of the realistic ways: a quoted literal, a bare segment passed to a path
// builder, or a bare `status.md` word token.
const STATUS_MD = /\bstatus\.md\b/;

describe('the no-board invariant (ADR-0084 D3, retired board — ADR-0137)', () => {
    const filesByDir = layerDirs.map((dir) => ({ dir, files: use_case_files(dir) }));
    const files = filesByDir.flatMap(({ files }) => files);

    it('finds the use-case source files across all five layers to check', () => {
        for (const { dir, files } of filesByDir) {
            expect(files.length, `${dir} must contribute use-case files to the scan`).toBeGreaterThan(0);
        }
        expect(files.length).toBeGreaterThan(20);
    });

    it('NO use-case in any layer names a `status.md` path — the board is gone, not merely unwritten', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            expect(STATUS_MD.test(text), `${file} must not reference a status.md board path`).toBe(false);
        }
    });
});
