import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { scan_spec_staleness } from '../useCases/scanSpecStaleness.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'corpus-stale-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

// Write a spec with the given frontmatter snapshot + a single Affected area, plus a prose backtick the
// extractor must ignore. snapshot/status are templated so a test can omit/vary them.
function writeSpec(opts: { snapshot?: string; status?: string; area?: string }): void {
    mkdirSync(join(repo, 'specs', 'x'), { recursive: true });
    const snapLine = opts.snapshot !== undefined ? `snapshot: ${opts.snapshot}\n` : '';
    const area = opts.area ?? 'src/a.ts';
    const spec = `---\ntype: spec\nid: SPEC-x\nstatus: ${opts.status ?? 'active'}\n${snapLine}sources:\n  - self\n---\n\n## Affected areas\n\n- \`${area}\` — run \`corpus check\` after\n`;
    writeFileSync(join(repo, 'specs', 'x', 'spec.md'), spec);
}

function commitCode(content: string): string {
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.ts'), content);
    git(['add', '.']);
    git(['commit', '-m', 'code']);
    return git(['rev-parse', 'HEAD']).trim();
}

describe('scan_spec_staleness (ADR-0108 item 4; SPEC-spec-staleness-detection)', () => {
    it('flags a spec whose Affected area changed since its snapshot SHA', () => {
        const sha = commitCode('export const v = 1;\n');
        writeSpec({ snapshot: sha });
        writeFileSync(join(repo, 'src', 'a.ts'), 'export const v = 2;\n'); // drift after the snapshot
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.scanned).toBe(1);
        expect(report.stale).toHaveLength(1);
        expect(report.stale[0].id).toBe('SPEC-x');
        expect(report.stale[0].changedAreas).toEqual(['src/a.ts']);
    });

    it('does not flag a spec whose areas are unchanged since the snapshot', () => {
        const sha = commitCode('export const v = 1;\n');
        writeSpec({ snapshot: sha }); // the spec file is new, but src/a.ts is untouched since `sha`
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.scanned).toBe(1);
        expect(report.stale).toEqual([]);
    });

    it('skips a spec with no snapshot (nothing to compare) — not counted as scanned', () => {
        commitCode('export const v = 1;\n');
        writeSpec({}); // no snapshot
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed\n');
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.scanned).toBe(0);
        expect(report.stale).toEqual([]);
    });

    it('skips a draft spec even with a drifted snapshot', () => {
        const sha = commitCode('export const v = 1;\n');
        writeSpec({ snapshot: sha, status: 'draft' });
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed\n');
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.scanned).toBe(0);
        expect(report.stale).toEqual([]);
    });

    it('skips (0-FP) when the snapshot SHA does not resolve in the repo', () => {
        commitCode('export const v = 1;\n');
        writeSpec({ snapshot: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' });
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.scanned).toBe(1); // eligible (non-draft + has a snapshot) but unresolvable → skip
        expect(report.stale).toEqual([]);
    });

    it('a cross-root area (a path not in this repo) never false-flags', () => {
        const sha = commitCode('export const v = 1;\n');
        writeSpec({ snapshot: sha, area: 'corpus-cli/src/elsewhere.ts' }); // sibling-repo path
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed\n'); // a real change, but not the declared area
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.stale).toEqual([]); // the declared area is not under this repo's changed set
    });
});
