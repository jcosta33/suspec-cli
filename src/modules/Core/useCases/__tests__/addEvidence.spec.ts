import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, realpathSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { add_evidence, type EvidenceCapture } from '../addEvidence.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';
import { ok, err } from '../../../../infra/errors/result.ts';
import { createAppError } from '../../../../infra/errors/createAppError.ts';

// SPEC-suspec-v2 AC-010/AC-012: the evidence-add engine — the CLI runs the command itself,
// records raw output + the cli-verified record + the staleness digest, and appends the run row.

let store: string;
let worktree: string;

const RUN = (wt: string): string =>
    `---\ntype: run\nspec: SPEC-feat\nworktree: ${wt}\nbranch: suspec/feat\nstatus: exited\n---\n\n# Run\n\nagent notes\n`;

const okCapture =
    (exit: number, stdout: string, stderr = ''): EvidenceCapture =>
    () =>
        ok({ exit, stdout, stderr });

beforeEach(() => {
    store = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-evidence-'));
    worktree = join(store, 'wt');
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(store, 'run-feat.md'), RUN(worktree));
});

afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

function add(overrides: Partial<Parameters<typeof add_evidence>[0]> = {}) {
    return add_evidence({
        storeDir: store,
        runSlug: 'feat',
        ac: 'AC-001',
        command: ['pnpm', 'test:run'],
        capture: okCapture(0, 'all green\n'),
        diffDigest: () => 'digest-1',
        now: () => new Date('2026-07-09T10:00:00.000Z'),
        ...overrides,
    });
}

describe('add_evidence', () => {
    it('writes the raw capture + the cli-verified record and appends the run table row (exit 0 → clean)', () => {
        const report = assertOk(add());
        expect(report.level).toBe('clean');
        expect(report.exit).toBe(0);
        expect(report.provenance).toBe('cli-verified');

        const record = readFileSync(report.evidencePath, 'utf8');
        expect(record).toContain('type: evidence');
        expect(record).toContain('run: feat');
        expect(record).toContain('ac: AC-001');
        expect(record).toContain('command: pnpm test:run');
        expect(record).toContain('exit: 0');
        expect(record).toContain('provenance: cli-verified');
        expect(record).toContain('worktree_diff_sha: digest-1');
        expect(record).toContain('capture_file: 001-pnpm-test-run.out');
        expect(record).toContain('grammar_version: 1'); // AC-003: the write path stamps it

        expect(readFileSync(report.capturePath, 'utf8')).toBe('all green\n');

        const run = readFileSync(join(store, 'run-feat.md'), 'utf8');
        expect(run).toContain('agent notes'); // the agent-owned body survives
        expect(run).toContain('| 001-pnpm-test-run | AC-001 | 0 | cli-verified |');
    });

    it('records a FAILING command too — exit mirrored as warning, stderr captured', () => {
        const report = assertOk(add({ capture: okCapture(3, 'partial\n', 'boom\n'), ac: 'AC-002' }));
        expect(report.level).toBe('warning');
        expect(report.exit).toBe(3);
        expect(readFileSync(report.capturePath, 'utf8')).toBe('partial\nboom\n');
        expect(readFileSync(report.evidencePath, 'utf8')).toContain('exit: 3');
        expect(readFileSync(join(store, 'run-feat.md'), 'utf8')).toContain('| AC-002 | 3 | cli-verified |');
    });

    it('sequences records: a second capture lands as 002-*', () => {
        assertOk(add());
        const second = assertOk(add({ command: ['pnpm', 'lint'] }));
        expect(second.evidencePath).toContain('002-pnpm-lint.md');
    });

    it('records the staleness digest as uncomputable when the worktree cannot be hashed', () => {
        const report = assertOk(add({ diffDigest: () => null }));
        expect(readFileSync(report.evidencePath, 'utf8')).toContain('worktree_diff_sha: uncomputable');
    });

    it('is a usage Err when the run does not exist in the store', () => {
        const error = assertErr(add({ runSlug: 'nope' }));
        expect(error._tag).toBe('Usage');
        expect(error.message).toContain('run-nope.md');
    });

    it('is an Err when the run records no worktree or the worktree is gone — nothing written', () => {
        writeFileSync(join(store, 'run-bare.md'), '---\ntype: run\nspec: SPEC-feat\nstatus: exited\n---\n');
        expect(assertErr(add({ runSlug: 'bare' }))._tag).toBe('evidence_worktree_missing');

        rmSync(worktree, { recursive: true, force: true });
        expect(assertErr(add())._tag).toBe('evidence_worktree_missing');
        expect(existsSync(join(store, 'evidence'))).toBe(false);
    });

    it('propagates a capture that could not execute at all — nothing written', () => {
        const error = assertErr(
            add({ capture: () => err(createAppError('capture_spawn_failed', 'no such binary', {})) })
        );
        expect(error._tag).toBe('capture_spawn_failed');
        expect(existsSync(join(store, 'evidence'))).toBe(false);
    });

    it('surfaces an unopenable evidence dir as an Err, never a crash (a file squatting on evidence/)', () => {
        writeFileSync(join(store, 'evidence'), 'not a directory');
        const error = assertErr(add());
        expect(error._tag).toBe('evidence_dir_unwritable');
    });

    it('surfaces a raw-capture write failure as an Err (a read-only evidence dir)', () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        chmodSync(dir, 0o555);
        try {
            expect(assertErr(add())._tag).toBe('store_write_failed');
        } finally {
            chmodSync(dir, 0o755);
        }
    });

    it('surfaces a run-file write failure as an Err (the run vanishes into a dir mid-capture)', () => {
        // The injected capture sabotages the run file between the launch-time read and the final
        // table append — the append's atomic rename then fails onto a directory.
        const error = assertErr(
            add({
                capture: (command, cwd) => {
                    rmSync(join(store, 'run-feat.md'));
                    mkdirSync(join(store, 'run-feat.md'));
                    void command;
                    void cwd;
                    return ok({ exit: 0, stdout: 'out', stderr: '' });
                },
            })
        );
        expect(error._tag).toBe('store_write_failed');
    });
});
