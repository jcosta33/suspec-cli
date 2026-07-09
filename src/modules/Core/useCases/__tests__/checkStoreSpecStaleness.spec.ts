import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { check_store_spec_staleness } from '../checkStoreSpecStaleness.ts';

// SPEC-suspec-v2 AC-007: a store spec's recorded base_sha + affected_areas vs the repo's current
// state — drifted files under the areas mark the spec stale; everything else degrades to
// not-stale (0-FP).

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const spec = (baseSha: string | null, areas: readonly string[]): string =>
    `---\ntype: spec\nid: SPEC-x\n${baseSha !== null ? `base_sha: ${baseSha}\n` : ''}${
        areas.length > 0 ? `affected_areas:\n${areas.map((a) => `  - ${a}`).join('\n')}\n` : ''
    }---\n\nbody\n`;

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stale-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'src'), { recursive: true });
    mkdirSync(join(repo, 'docs'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    writeFileSync(join(repo, 'docs', 'd.md'), 'd');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('check_store_spec_staleness (AC-007)', () => {
    it('flags the spec stale with the drifted files when an affected area changed since base_sha', () => {
        const base = git(['rev-parse', 'HEAD']).trim();
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed'); // uncommitted edits count too
        writeFileSync(join(repo, 'src', 'new.ts'), 'new');
        git(['add', '.']);
        git(['commit', '-m', 'drift']);
        const report = check_store_spec_staleness({ repoRoot: repo, specSource: spec(base, ['src']) });
        expect(report.stale).toBe(true);
        expect(report.baseSha).toBe(base);
        expect([...report.driftedFiles].sort()).toEqual(['src/a.ts', 'src/new.ts']);
    });

    it('stays clean when the drift is OUTSIDE the affected areas', () => {
        const base = git(['rev-parse', 'HEAD']).trim();
        writeFileSync(join(repo, 'docs', 'd.md'), 'changed');
        const report = check_store_spec_staleness({ repoRoot: repo, specSource: spec(base, ['src']) });
        expect(report.stale).toBe(false);
        expect(report.driftedFiles).toEqual([]);
    });

    it('accepts a scalar affected_areas and matches an exact file area', () => {
        const base = git(['rev-parse', 'HEAD']).trim();
        writeFileSync(join(repo, 'docs', 'd.md'), 'changed');
        const report = check_store_spec_staleness({
            repoRoot: repo,
            specSource: `---\nbase_sha: ${base}\naffected_areas: docs/d.md\n---\n`,
        });
        expect(report.stale).toBe(true);
        expect(report.areas).toEqual(['docs/d.md']);
    });

    it('degrades to not-stale with no base_sha, no areas, or an unresolvable SHA (0-FP)', () => {
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed');
        expect(check_store_spec_staleness({ repoRoot: repo, specSource: spec(null, ['src']) }).stale).toBe(false);
        const base = git(['rev-parse', 'HEAD']).trim();
        expect(check_store_spec_staleness({ repoRoot: repo, specSource: spec(base, []) }).stale).toBe(false);
        expect(
            check_store_spec_staleness({
                repoRoot: repo,
                specSource: spec('0000000000000000000000000000000000000000', ['src']),
            }).stale
        ).toBe(false);
    });
});
