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
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stale-')));
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
    const spec = `---\ntype: spec\nid: SPEC-x\nstatus: ${opts.status ?? 'active'}\n${snapLine}sources:\n  - self\n---\n\n## Affected areas\n\n- \`${area}\` — run \`suspec check\` after\n`;
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

    it('a prefixed area whose sibling repo does not exist never false-flags', () => {
        const sha = commitCode('export const v = 1;\n');
        writeSpec({ snapshot: sha, area: 'nosuchrepo/src/elsewhere.ts' }); // no ../nosuchrepo sibling
        writeFileSync(join(repo, 'src', 'a.ts'), 'changed\n'); // a real change, but not the declared area
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.stale).toEqual([]); // sibling absent → falls back to this repo; the area is not under it
    });

    it('a prefixed area whose snapshot SHA does not resolve in the fallback repo never false-flags (SHA-gated 0-FP)', () => {
        // The sibling ../<prefix> is absent → resolve falls back to THIS repo. The snapshot is a foreign
        // SHA that does not exist here, so paths_changed_since returns null → the area skips. This holds
        // even when a workspace dir happens to be named like the prefix and a file under it changed.
        mkdirSync(join(repo, 'suspec-cli', 'src'), { recursive: true });
        writeFileSync(join(repo, 'suspec-cli', 'src', 'foo.ts'), 'v1\n');
        git(['add', '.']);
        git(['commit', '-m', 'c']);
        writeSpec({ snapshot: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', area: 'suspec-cli/src/foo.ts' });
        writeFileSync(join(repo, 'suspec-cli', 'src', 'foo.ts'), 'v2\n'); // a real change, but the SHA is foreign here
        const report = assertOk(scan_spec_staleness({ workspaceDir: repo, repoRoot: repo }));
        expect(report.stale).toEqual([]); // foreign SHA unresolvable in the fallback repo → skipped
    });

    it('cross-root: resolves a sibling-repo area and flags drift THERE (suspec-cli#2)', () => {
        // A dedicated-workspace layout: the spec lives in `ws`, its code in the sibling repo `sib`.
        const parent = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stale-xroot-')));
        const ws = join(parent, 'ws');
        const sib = join(parent, 'sib');
        const gitIn = (dir: string, args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
        for (const d of [ws, sib]) {
            mkdirSync(d, { recursive: true });
            gitIn(d, ['init']);
            gitIn(d, ['config', 'user.email', 't@e.com']);
            gitIn(d, ['config', 'user.name', 'T']);
        }
        // sibling code committed → the snapshot SHA is the SIBLING's commit
        mkdirSync(join(sib, 'src'), { recursive: true });
        writeFileSync(join(sib, 'src', 'a.ts'), 'v1\n');
        gitIn(sib, ['add', '.']);
        gitIn(sib, ['commit', '-m', 'code']);
        const sha = gitIn(sib, ['rev-parse', 'HEAD']).trim();
        // the spec, in ws, declares a sibling-prefixed area (the `sib/` prefix = the sibling dir name)
        mkdirSync(join(ws, 'specs', 'x'), { recursive: true });
        writeFileSync(
            join(ws, 'specs', 'x', 'spec.md'),
            `---\ntype: spec\nid: SPEC-x\nstatus: active\nsnapshot: ${sha}\nsources:\n  - self\n---\n\n## Affected areas\n\n- \`sib/src/a.ts\`\n`
        );
        writeFileSync(join(sib, 'src', 'a.ts'), 'v2\n'); // drift in the sibling
        const report = assertOk(scan_spec_staleness({ workspaceDir: ws, repoRoot: ws }));
        rmSync(parent, { recursive: true, force: true });
        expect(report.stale).toHaveLength(1);
        expect(report.stale[0].changedAreas).toEqual(['sib/src/a.ts']);
    });
});
