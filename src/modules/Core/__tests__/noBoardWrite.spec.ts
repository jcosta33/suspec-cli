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
// write-set of EVERY use-case layer (Commands, Sol, Core, Workspace) excludes the board, and that the
// two prepare verbs (`pull` / `promote`) leave a pre-existing `status.md` byte-unchanged. If a future
// change wires a board write into ANY of those layers, this test fails loudly.
//
// Scope (gap closed): the scan walks all four use-case layers, not Core alone — because a write does
// NOT funnel through one boundary. `write_new_file` (Workspace) is the draft writer's sole edge, but
// `initWorkspace` / `cutPacket` / `scaffoldSpec` / `stampRuntimeIsolation` write via `fs` directly, so
// a board write wired into a Commands/Sol/Workspace-layer use-case would escape a Core-only scan.
//
// Match (gap narrowed, not fully closed): a static scan reads source text, so it cannot resolve a path
// assembled at runtime from variables. It DOES catch `status.md` whether written as a quoted literal
// (`'status.md'`) or as a bare segment passed to `join(...)` (`join(dir, 'status.md')`) or named as a
// word token near a write call — the realistic ways a board write would be spelled. The byte-unchanged
// dynamic checks below are the runtime backstop for paths a static scan cannot see.

// The four layers that hold use-cases (one function per file). The scan must cover every layer a write
// could be wired into, not Core alone.
const layerDirs = (['Commands', 'Sol', 'Core', 'Workspace'] as const).map((layer) =>
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

// Any filesystem-write call name. A use-case that names `status.md` near one of these would be writing
// the board — the regression we forbid. (`init`'s kit copy walks files generically and never names
// `status.md` itself, so it is unaffected; `checkWorkspace` only READS `status.md`.)
const WRITE_CALLS = /\b(?:writeFileSync|appendFileSync|write_new_file|copyFileSync|renameSync|symlinkSync|writeFile)\b/;
// `status.md` written any of the realistic ways: a quoted literal (`'status.md'`, `'specs/status.md'`),
// a bare segment passed to a path builder (`join(dir, 'status.md')`), or a bare `status.md` word token.
// Broader than the old quoted-only `/['"`][^'"`]*status\.md['"`]/` so a `join`/segment-built board path
// no longer escapes the scan.
const STATUS_MD = /\bstatus\.md\b/;

describe('the no-board-write invariant (AC-003, ADR-0084 D3)', () => {
    const filesByDir = layerDirs.map((dir) => ({ dir, files: use_case_files(dir) }));
    const files = filesByDir.flatMap(({ files }) => files);

    it('finds the use-case source files across all four layers to check', () => {
        // Every layer contributes at least one use-case file; the union is well over the Core-only count.
        for (const { dir, files } of filesByDir) {
            expect(files.length, `${dir} must contribute use-case files to the scan`).toBeGreaterThan(0);
        }
        expect(files.length).toBeGreaterThan(20);
    });

    it('no use-case (Commands/Sol/Core/Workspace) names `status.md` as a write target (the write-set excludes the board)', () => {
        for (const file of files) {
            const text = readFileSync(file, 'utf8');
            const hasWrite = WRITE_CALLS.test(text);
            const namesStatusMd = STATUS_MD.test(text);
            // A use-case that both performs a write AND names a `status.md` path is the board-mutating
            // regression this invariant forbids — in ANY layer, regardless of quoting.
            expect(hasWrite && namesStatusMd, `${file} must not write a status.md path`).toBe(false);
        }
    });

    it('the only use-case that names `status.md` reads it (Core/checkWorkspace), never writes it', () => {
        const namers = files
            .filter((file) => STATUS_MD.test(readFileSync(file, 'utf8')))
            .map((file) => relative(fileURLToPath(new URL('../../..', import.meta.url)), file));
        // If a new use-case in any layer starts referencing status.md, this list changes and the test
        // fails — a forcing function to re-examine whether that reference writes the board.
        expect(namers.sort()).toEqual(['modules/Core/useCases/checkWorkspace.ts']);
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
