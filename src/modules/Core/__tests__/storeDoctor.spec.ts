import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { store_doctor, type PrStateProbe } from '../useCases/storeDoctor.ts';

// SPEC-suspec-v2 AC-018 — the engine's edges the command-level suite (store.spec.ts) cannot reach
// cheaply: the injected PR probe (gh-absent short-circuit, per-branch caching), the orphan ladder
// on a repo with no git at all (every git probe reads false → never archive on ambiguity), and
// the unreadable-store hard error. The git-truth scenarios (merged branch, worktree gone, closed
// PR via a PATH-stubbed gh) run end-to-end in store.spec.ts.

let root: string;
let repo: string; // NOT a git repo — branch_exists/branch_merged read false, by design
let store: string;

const no_pr: PrStateProbe = () => ({ available: true, state: null });

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'suspec-doctor-'));
    repo = join(root, 'repo');
    store = join(root, 'store');
    mkdirSync(repo);
    mkdirSync(store);
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('store_doctor — engine edges', () => {
    it('an unreadable store dir is a hard Err (the only non-zero path)', () => {
        const error = assertErr(store_doctor({ storeDir: join(store, 'nope'), repoRoot: repo, prState: no_pr }));
        expect(error._tag).toBe('store_unreadable');
    });

    it('a run with no branch/worktree that never existed is an ORPHAN — listed, never archived', () => {
        writeFileSync(join(store, 'run-ghost.md'), '---\ntype: run\nstatus: exited\n---\n\nbody\n');
        const report = assertOk(store_doctor({ storeDir: store, repoRoot: repo, prState: no_pr }));
        expect(report.orphans).toEqual(['run-ghost.md']);
        expect(report.artifacts).toEqual([
            expect.objectContaining({ filename: 'run-ghost.md', action: 'orphan-listed', signal: null }),
        ]);
    });

    it('a MERGED PR archives even when the local branch is already deleted (the post-merge cleanup state)', () => {
        writeFileSync(
            join(store, 'run-gone.md'),
            '---\ntype: run\nstatus: exited\nbranch: suspec/gone\nworktree: /nope\n---\n'
        );
        writeFileSync(join(store, 'spec-gone.md'), '---\ntype: spec\nstatus: ready\n---\n');
        const seen: string[] = [];
        const probe: PrStateProbe = (branch) => {
            seen.push(branch);
            return { available: true, state: 'MERGED' };
        };
        const report = assertOk(store_doctor({ storeDir: store, repoRoot: repo, prState: probe }));
        expect(report.artifacts).toEqual([
            expect.objectContaining({ filename: 'run-gone.md', signal: 'pr-closed', action: 'archived' }),
            expect.objectContaining({ filename: 'spec-gone.md', signal: 'pr-closed', action: 'archived' }),
        ]);
        // The spec's derived branch equals the run's recorded one — ONE probe, then the cache.
        expect(seen).toEqual(['suspec/gone']);
    });

    it('an OPEN PR is no signal; gh absent short-circuits every later probe and notes once', () => {
        writeFileSync(
            join(store, 'run-a.md'),
            '---\ntype: run\nstatus: exited\nbranch: suspec/a\nworktree: /nope\n---\n'
        );
        writeFileSync(
            join(store, 'run-b.md'),
            '---\ntype: run\nstatus: exited\nbranch: suspec/b\nworktree: /nope\n---\n'
        );
        const open = assertOk(
            store_doctor({ storeDir: store, repoRoot: repo, prState: () => ({ available: true, state: 'OPEN' }) })
        );
        // Branch never existed locally + worktree gone, but a PR EXISTS → not an orphan, left.
        expect(open.orphans).toEqual([]);
        expect(open.artifacts.every((row) => row.action === 'left')).toBe(true);

        let calls = 0;
        const absent: PrStateProbe = () => {
            calls += 1;
            return { available: false, state: null };
        };
        const report = assertOk(store_doctor({ storeDir: store, repoRoot: repo, prState: absent }));
        expect(calls).toBe(1); // the second branch never probes — gh already read absent
        expect(report.ghAvailable).toBe(false);
        expect(report.notes).toEqual(['gh is not installed — PR-state checks skipped']);
    });

    it('a live run with a fresh heartbeat is left without probing anything', () => {
        writeFileSync(
            join(store, 'run-live.md'),
            `---\ntype: run\nstatus: live\nheartbeat: ${new Date().toISOString()}\nbranch: suspec/live\n---\n`
        );
        const boom: PrStateProbe = () => {
            throw new Error('a live run must not be probed');
        };
        const report = assertOk(store_doctor({ storeDir: store, repoRoot: repo, prState: boom }));
        expect(report.artifacts).toEqual([
            expect.objectContaining({ filename: 'run-live.md', action: 'left', detail: 'live run' }),
        ]);
    });

    it('non-spec/run artifacts and dirs masquerading as artifacts are ignored', () => {
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\n---\n');
        writeFileSync(join(store, 'intake-x.md'), '---\ntype: intake\n---\n');
        mkdirSync(join(store, 'run-dir.md'));
        const report = assertOk(store_doctor({ storeDir: store, repoRoot: repo, prState: no_pr }));
        expect(report.artifacts).toEqual([]);
        expect(report.orphans).toEqual([]);
    });
});
