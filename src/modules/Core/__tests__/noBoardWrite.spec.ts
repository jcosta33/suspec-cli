import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { ok } from '../../../infra/errors/result.ts';
import { pull_intake, type GhFetcher } from '../useCases/pullIntake.ts';
import { scaffold_finding } from '../useCases/scaffoldFinding.ts';

// ADR-0084 D3 — THE LOAD-BEARING INVARIANT: no swarm-cli command writes `status.md` or any board
// state; the board is hand-edited. The board-mutating close is PARKED (DECIDE #1.2). This boundary
// regression test makes the no-board-write property an invariant, not a convention — it asserts the
// write-set of every Core use-case excludes the board, and that the two prepare verbs (`pull` /
// `promote`) leave a pre-existing `status.md` byte-unchanged. If a future change wires a board write
// into Core, this test fails loudly.

const useCasesDir = fileURLToPath(new URL('../useCases', import.meta.url));

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

// Any filesystem-write call name. A Core use-case that names `status.md` near one of these would be
// writing the board — the regression we forbid. (`init`'s kit copy walks files generically and never
// names `status.md` as a literal, so it is unaffected; `checkWorkspace` only READS `status.md`.)
const WRITE_CALLS = /\b(?:writeFileSync|appendFileSync|write_new_file|copyFileSync|renameSync|symlinkSync|writeFile)\b/;
const STATUS_MD = /['"`][^'"`]*status\.md['"`]/;

describe('the no-board-write invariant (AC-003, ADR-0084 D3)', () => {
    const files = use_case_files(useCasesDir);

    it('finds the Core use-case source files to check', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('no Core use-case names `status.md` as a write target (the write-set excludes the board)', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            const hasWrite = WRITE_CALLS.test(text);
            const namesStatusMd = STATUS_MD.test(text);
            // A use-case that both performs a write AND names a literal `status.md` path is the
            // board-mutating regression this invariant forbids.
            expect(hasWrite && namesStatusMd, `${relative(useCasesDir, file)} must not write a literal status.md path`).toBe(
                false
            );
        }
    });

    it('the only Core use-case that names `status.md` reads it (checkWorkspace), never writes it', () => {
        const namers = files
            .filter((file) => STATUS_MD.test(readFileSync(file, 'utf8')) || /\bstatus\.md\b/.test(readFileSync(file, 'utf8')))
            .map((file) => relative(useCasesDir, file));
        // If a new use-case starts referencing status.md, this list changes and the test fails — a
        // forcing function to re-examine whether that reference writes the board.
        expect(namers.sort()).toEqual(['checkWorkspace.ts']);
    });
});

describe('the prepare verbs leave the board byte-unchanged (AC-003)', () => {
    let ws: string;
    const fetch_stub: GhFetcher = () => ok({ title: 'T', body: 'B' });

    beforeEach(() => {
        ws = mkdtempSync(join(tmpdir(), 'swarm-board-'));
    });
    afterEach(() => {
        rmSync(ws, { recursive: true, force: true });
    });

    it('`pull` then `promote` never touch a pre-existing status.md', () => {
        const board = '# Board\n\n| spec | task | review |\n| --- | --- | --- |\n| SPEC-x | TASK-x | — |\n';
        const boardPath = join(ws, 'status.md');
        writeFileSync(boardPath, board);
        const mtimeBefore = statSync(boardPath).mtimeMs;

        assertOk(pull_intake({ workspaceDir: ws, ref: 'o/r#1', fetchGhIssue: fetch_stub }));
        assertOk(scaffold_finding({ workspaceDir: ws, from: 'TASK-x' }));

        // Byte-unchanged AND untouched (mtime is preserved when the file is never written).
        expect(readFileSync(boardPath, 'utf8')).toBe(board);
        expect(statSync(boardPath).mtimeMs).toBe(mtimeBefore);
        // The new files landed only under intake/ and findings/ — the board is not in the write-set.
        expect(readdirSync(join(ws, 'intake'))).toEqual(['o-r-1.md']);
        expect(readdirSync(join(ws, 'findings'))).toEqual(['x.md']);
    });
});
