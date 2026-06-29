import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { resolve_review_run_by_spec } from '../useCases/resolveReviewRunBySpec.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - self
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.
`;

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-rrbs-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
    writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'a.ts'), 'v1\n');
    git(['add', '.']);
    git(['commit', '-m', 'base']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('resolve_review_run_by_spec (review-to-spec, ADR-0103)', () => {
    it('resolves a spec by id, marks the run task-less, and diffs the code repo', () => {
        writeFileSync(join(repo, 'src', 'a.ts'), 'v2\n'); // an uncommitted change in the code repo
        const result = assertOk(resolve_review_run_by_spec({ workspaceDir: repo, repoRoot: repo, spec: 'SPEC-feat' }));
        expect(result.taskPacketSource).toBeNull();
        expect(result.task).toBe('SPEC-feat');
        expect(result.specSource).toContain('id: SPEC-feat');
        expect(result.diffChangedFiles).toContain('src/a.ts');
    });

    it('resolves a spec by dir slug too', () => {
        const result = assertOk(resolve_review_run_by_spec({ workspaceDir: repo, repoRoot: repo, spec: 'feat' }));
        expect(result.specSource).toContain('id: SPEC-feat');
    });

    it('finds a review packet that names the spec via spec: frontmatter', () => {
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'r.md'), '---\ntype: review\nid: REVIEW-x\nspec: SPEC-feat\nstatus: needs-human\n---\n');
        const result = assertOk(resolve_review_run_by_spec({ workspaceDir: repo, repoRoot: repo, spec: 'SPEC-feat' }));
        expect(result.reviewPacketSource).not.toBeNull();
    });

    it('errors when neither a task nor a spec matches the ref', () => {
        const result = resolve_review_run_by_spec({ workspaceDir: repo, repoRoot: repo, spec: 'nonexistent' });
        expect(isOk(result)).toBe(false);
    });
});
