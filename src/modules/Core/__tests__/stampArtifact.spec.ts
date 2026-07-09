import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { stamp_artifact } from '../useCases/stampArtifact.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const SPEC = `---
type: spec
id: SPEC-feat
status: active
sources:
  - self
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.
`;

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stamp-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    git(['add', '.']);
    git(['commit', '-m', 'base']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('stamp_artifact (suspec stamp; ADR-0107/0108)', () => {
    it('stamps a spec snapshot = HEAD (by dir slug and by id)', () => {
        const head = git(['rev-parse', 'HEAD']).trim();
        const bySlug = assertOk(stamp_artifact({ workspaceDir: repo, repoRoot: repo, ref: 'feat' }));
        expect(bySlug.kind).toBe('spec');
        expect(bySlug.stamped.snapshot).toBe(head);
        expect(readFileSync(join(repo, 'specs', 'feat', 'spec.md'), 'utf8')).toContain(`snapshot: ${head}`);

        const byId = assertOk(stamp_artifact({ workspaceDir: repo, repoRoot: repo, ref: 'SPEC-feat' }));
        expect(byId.kind).toBe('spec');
        // re-stamping updates in place (no duplicate snapshot line)
        const occurrences = readFileSync(join(repo, 'specs', 'feat', 'spec.md'), 'utf8').match(/snapshot:/g) ?? [];
        expect(occurrences).toHaveLength(1);
    });

    it('a ref that matches no spec errs, pointing at the store review loop (ADR-0137)', () => {
        const failure = assertErr(stamp_artifact({ workspaceDir: repo, repoRoot: repo, ref: 'nonexistent' }));
        expect(failure.message).toContain('suspec review <RUN>');
    });

    it('refuses a path-like ref (traversal defense — no write outside the workspace)', () => {
        const outside = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stamp-outside-')));
        writeFileSync(join(outside, 'spec.md'), '---\nid: SPEC-victim\n---\n');
        // a traversal ref would resolve a spec.md outside the workspace; it must be refused before any write
        const result = stamp_artifact({
            workspaceDir: repo,
            repoRoot: repo,
            ref: `../${outside.split('/').pop() ?? 'x'}`,
        });
        const untouched = readFileSync(join(outside, 'spec.md'), 'utf8');
        rmSync(outside, { recursive: true, force: true });
        expect(isOk(result)).toBe(false);
        expect(untouched).not.toContain('snapshot:'); // the outside file was never written
    });

    it('errors when the repo has no resolvable HEAD (a fresh init, no commits)', () => {
        const fresh = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-stamp-fresh-')));
        execFileSync('git', ['init'], { cwd: fresh });
        const result = stamp_artifact({ workspaceDir: fresh, repoRoot: fresh, ref: 'feat' });
        rmSync(fresh, { recursive: true, force: true });
        expect(isOk(result)).toBe(false);
    });
});
