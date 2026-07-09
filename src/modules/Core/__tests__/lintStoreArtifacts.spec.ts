import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { lint_store_artifacts } from '../useCases/lintStoreArtifacts.ts';

let store: string;
let repo: string;

const SPEC = `---
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
Verify with: \`node -e "ok"\`.

## Non-goals

- none.

## Open questions

none.
`;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-storelint-'));
    repo = mkdtempSync(join(tmpdir(), 'suspec-storelint-repo-'));
    writeFileSync(join(store, 'notes.md'), 'origin notes\n');
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
});

describe('lint_store_artifacts — `suspec check` with no args (ADR-0137)', () => {
    it('an empty store is clean — nothing to lint is not a defect', () => {
        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.level).toBe('clean');
        expect(report.artifacts).toEqual([]);
        expect(report.runCount).toBe(0);
        expect(report.specCount).toBe(0);
    });

    it('a missing store dir reads as empty', () => {
        const report = assertOk(lint_store_artifacts({ storeDir: join(store, 'nope'), repoRoot: repo }));
        expect(report.level).toBe('clean');
        expect(report.artifacts).toEqual([]);
    });

    it('lints every run (run record + driving spec + evidence) and every backlog spec once', () => {
        writeFileSync(join(store, 'spec-feat.md'), SPEC);
        writeFileSync(join(store, 'run-feat.md'), '---\ntype: run\nspec: SPEC-feat\nstatus: exited\n---\n\n# Run\n');
        // A backlog spec no run reached — still linted.
        writeFileSync(join(store, 'spec-backlog.md'), SPEC.replace('SPEC-feat', 'SPEC-backlog'));

        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.runCount).toBe(1);
        expect(report.specCount).toBe(2);
        const paths = report.artifacts.map((artifact) => artifact.path);
        expect(paths).toContain(join(store, 'run-feat.md'));
        expect(paths).toContain(join(store, 'spec-feat.md'));
        expect(paths).toContain(join(store, 'spec-backlog.md'));
        // The run-covered spec appears exactly once (deduped between the run pass and the spec pass).
        expect(paths.filter((path) => path === join(store, 'spec-feat.md'))).toHaveLength(1);
    });

    it('a run naming a missing driving spec is a hard error → blocking level', () => {
        writeFileSync(join(store, 'run-lost.md'), '---\ntype: run\nspec: SPEC-ghost\nstatus: exited\n---\n\n# Run\n');
        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.level).toBe('blocking');
        const run = report.artifacts.find((artifact) => artifact.path === join(store, 'run-lost.md'));
        expect(run?.diagnostics.some((d) => d.check === 'RUN02' && d.severity === 'hard-error')).toBe(true);
    });

    it('a backlog spec that does not parse is a hard error (C001) → blocking level', () => {
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter here');
        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.level).toBe('blocking');
        const spec = report.artifacts.find((artifact) => artifact.path === join(store, 'spec-broken.md'));
        expect(spec?.diagnostics[0]?.check).toBe('C001');
    });

    it('a clean spec-only store aggregates to the spec checks level', () => {
        writeFileSync(join(store, 'spec-feat.md'), SPEC);
        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.specCount).toBe(1);
        // Whatever the contract says about this fixture, the level mirrors its diagnostics.
        const all = report.artifacts.flatMap((artifact) => artifact.diagnostics);
        if (all.some((d) => d.severity === 'hard-error')) {
            expect(report.level).toBe('blocking');
        } else if (all.length > 0) {
            expect(report.level).toBe('warning');
        } else {
            expect(report.level).toBe('clean');
        }
    });

    it('evidence/ and archive/ trees are not read as store artifacts', () => {
        mkdirSync(join(store, 'evidence', 'feat'), { recursive: true });
        writeFileSync(join(store, 'evidence', 'feat', 'ac-001.md'), 'raw');
        mkdirSync(join(store, 'archive'), { recursive: true });
        writeFileSync(join(store, 'archive', 'spec-old.md'), 'no frontmatter');
        const report = assertOk(lint_store_artifacts({ storeDir: store, repoRoot: repo }));
        expect(report.artifacts).toEqual([]);
    });
});
