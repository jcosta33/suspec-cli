import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { lint_run_artifacts } from '../lintRunArtifacts.ts';
import { capture_sha256 } from '../../services/evidenceArtifact.ts';
import { assertOk } from '../../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../../infra/errors/testing/assertErr.ts';

// SPEC-suspec-v2 AC-013: the deterministic checks re-aimed at store artifacts — per-artifact
// facts, no workspace verdict — plus the AC-010 forged-provenance flag.

let root: string;
let store: string;
let repo: string;

const CLEAN_SPEC = `---
type: spec
id: SPEC-feat
status: ready
grammar_version: 1
sources:
  - notes.md
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: \`pnpm test:run\`.

## Non-goals

- none.

## Open questions

none.
`;

const RUN = `---
type: run
spec: SPEC-feat
worktree: /wt
branch: suspec/feat
status: exited
---

# Run
`;

beforeEach(() => {
    root = mkdtempSync(join(realpathSync(tmpdir()), 'suspec-lint-'));
    store = join(root, 'store');
    repo = join(root, 'repo');
    mkdirSync(store, { recursive: true });
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(store, 'notes.md'), 'origin notes\n');
    writeFileSync(join(store, 'spec-feat.md'), CLEAN_SPEC);
    writeFileSync(join(store, 'run-feat.md'), RUN);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function lint(runSlug = 'feat') {
    return lint_run_artifacts({ storeDir: store, repoRoot: repo, runSlug });
}

type LintDiagnostic = Readonly<{ check: string; severity: string; message: string }>;
type LintReport = Readonly<{ artifacts: readonly Readonly<{ path: string; diagnostics: readonly LintDiagnostic[] }>[] }>;

function diagnostics_for(report: LintReport, suffix: string): readonly LintDiagnostic[] {
    return report.artifacts.filter((artifact) => artifact.path.endsWith(suffix)).flatMap((a) => a.diagnostics);
}

describe('lint_run_artifacts', () => {
    it('is clean for a well-formed spec + run pair, exposing gate-ready requirements', () => {
        const report = assertOk(lint());
        expect(report.level).toBe('clean');
        expect(report.specId).toBe('SPEC-feat');
        expect(report.requirements).toEqual([{ id: 'AC-001', verifyCommand: '`pnpm test:run`.' }]);
        expect(report.artifacts.flatMap((artifact) => artifact.diagnostics)).toEqual([]);
    });

    it('is an Err for a run absent from the store', () => {
        expect(assertErr(lint('nope'))._tag).toBe('store_run_not_found');
    });

    it('re-runs the contract spec checks against the store spec (a missing source is C009)', () => {
        rmSync(join(store, 'notes.md'));
        const report = assertOk(lint());
        const specDiagnostics = diagnostics_for(report, 'spec-feat.md');
        expect(specDiagnostics.some((diagnostic) => diagnostic.check === 'C009')).toBe(true);
        expect(report.level).toBe('blocking'); // C009 is a hard-error
    });

    it('hard-errors a run that names no driving spec, and one whose spec resolves to nothing', () => {
        writeFileSync(join(store, 'run-bare.md'), '---\ntype: run\nstatus: exited\n---\n');
        const bare = assertOk(lint('bare'));
        expect(bare.level).toBe('blocking');
        expect(bare.requirements).toBeNull();
        expect(diagnostics_for(bare, 'run-bare.md').some((d) => d.check === 'RUN02')).toBe(true);

        writeFileSync(join(store, 'run-ghost.md'), '---\ntype: run\nspec: SPEC-ghost\nstatus: exited\n---\n');
        const ghost = assertOk(lint('ghost'));
        expect(diagnostics_for(ghost, 'run-ghost.md')[0].message).toContain('SPEC-ghost');
    });

    it('warns when the run record is not typed run, and hard-errors an unparseable spec', () => {
        writeFileSync(join(store, 'run-feat.md'), '---\ntype: note\nspec: SPEC-feat\n---\n');
        const report = assertOk(lint());
        expect(diagnostics_for(report, 'run-feat.md').some((d) => d.check === 'RUN01')).toBe(true);

        // An unterminated fence: the id is still scannable (so the spec resolves), but the
        // record parser refuses the file — the C001-class hard-error path.
        writeFileSync(join(store, 'spec-feat.md'), '---\ntype: spec\nid: SPEC-feat\nstatus: ready');
        const broken = assertOk(lint());
        expect(broken.requirements).toBeNull();
        expect(diagnostics_for(broken, 'spec-feat.md')[0]).toMatchObject({ check: 'C001', severity: 'hard-error' });
    });

    it('checks a present review packet against the SPEC\'s full AC set (C012/C016 class)', () => {
        writeFileSync(
            join(store, 'review-feat.md'),
            `---
type: review
status: draft
---

## Requirement coverage

| Requirement | Result | Evidence |
| ----------- | ------ | -------- |
| AC-001 | Pass |  |
| AC-999 | Pass | something |
`
        );
        const report = assertOk(lint());
        const reviewDiagnostics = diagnostics_for(report, 'review-feat.md');
        expect(reviewDiagnostics.some((d) => d.check === 'C012' && d.message.includes('AC-999'))).toBe(true);
        expect(reviewDiagnostics.some((d) => d.check === 'C016')).toBe(true); // Pass with empty Evidence
        expect(report.level).toBe('blocking'); // C016 is the contract's hard-error
    });

    it('flags forged cli-verified provenance (EV03 hard-error) and hand-authored shape gaps (EV01/EV02)', () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        // The forgery: claims cli-verified, but no CLI capture block backs it.
        writeFileSync(join(dir, '001-forged.md'), '---\ntype: evidence\nac: AC-001\nexit: 0\nprovenance: cli-verified\n---\n');
        // Shape gaps: unknown provenance, no ac mapping.
        writeFileSync(join(dir, '002-loose.md'), '---\ntype: evidence\nprovenance: vibes\nexit: 0\n---\n');
        const report = assertOk(lint());
        expect(diagnostics_for(report, '001-forged.md')[0]).toMatchObject({ check: 'EV03', severity: 'hard-error' });
        const loose = diagnostics_for(report, '002-loose.md');
        expect(loose.some((d) => d.check === 'EV01')).toBe(true);
        expect(loose.some((d) => d.check === 'EV02')).toBe(true);
        expect(report.level).toBe('blocking');
    });

    it('accepts a genuine CLI capture block — no EV03', () => {
        const dir = join(store, 'evidence', 'feat');
        mkdirSync(dir, { recursive: true });
        const raw = 'ok\n';
        writeFileSync(join(dir, '001-cmd.out'), raw);
        writeFileSync(
            join(dir, '001-cmd.md'),
            `---
type: evidence
ac: AC-001
command: cmd
exit: 0
provenance: cli-verified
capture_file: 001-cmd.out
capture_bytes: ${Buffer.byteLength(raw, 'utf8')}
capture_sha256: ${capture_sha256(raw)}
---
`
        );
        const report = assertOk(lint());
        expect(report.artifacts.some((artifact) => artifact.path.endsWith('001-cmd.md'))).toBe(false); // clean records are not listed
        expect(report.level).toBe('clean');
    });
});
