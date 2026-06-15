import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { resolve_review_run } from '../useCases/resolveReviewRun.ts';
import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';

const SPEC = `---
type: spec
id: SPEC-feat
status: ready
sources:
  - ADR-0077
---

## Requirements

### AC-001 — one
The tool must do it.
Verify with: a test.

## Non-goals

- none.

## Open questions

- none.
`;

// A task packet whose source is a block list (`source:` then `- SPEC-feat`) — the resolver's
// block-list frontmatter path.
const TASK_BLOCK = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001]
status: review-ready
---

# Task

## Affected areas

- \`src\`

## Run summary

- Changed files: \`src/a.ts\`
`;

let repo: string;
const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function scaffold(opts: { task?: string; withSpec?: boolean; withWorktree?: boolean; review?: string } = {}): void {
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
    mkdirSync(join(repo, 'tasks'), { recursive: true });
    writeFileSync(join(repo, 'tasks', 'TASK-feat.md'), opts.task ?? TASK_BLOCK);
    if (opts.withSpec !== false) {
        mkdirSync(join(repo, 'specs', 'feat'), { recursive: true });
        writeFileSync(join(repo, 'specs', 'feat', 'spec.md'), SPEC);
    }
    if (opts.review !== undefined) {
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'notes.txt'), 'not a review'); // a non-.md file to skip
        writeFileSync(join(repo, 'reviews', 'feat.md'), opts.review);
    }
    git(['add', '.']);
    git(['commit', '-m', 'init']);
    if (opts.withWorktree !== false) {
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'feat-feat');
        git(['worktree', 'add', '-b', 'swarm/feat/feat', wt, base]);
        writeFileSync(join(wt, 'changed.ts'), 'x');
    }
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-resolve-')));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

describe('resolve_review_run (AC-017)', () => {
    it('resolves the task packet, source spec, review packet, and the worktree diff (block-list source)', () => {
        scaffold({ review: '---\ntype: review\nid: REVIEW-feat\ntask: TASK-feat\nstatus: draft\n---\n# r\n' });
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(resolved.task).toBe('TASK-feat');
        expect(resolved.specSource).toContain('SPEC-feat');
        expect(resolved.reviewPacketSource).toContain('REVIEW-feat');
        expect(resolved.diffChangedFiles).toContain('changed.ts');
    });

    it('resolves with no review packet present (reviewPacketSource is null)', () => {
        scaffold({});
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(resolved.reviewPacketSource).toBeNull();
    });

    it('honours an explicit base override', () => {
        scaffold({});
        const resolved = assertOk(
            resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat', base: 'HEAD' })
        );
        expect(resolved.diffChangedFiles).toContain('changed.ts');
    });

    it('Errs when no tasks/<task>.md exists (NoWorkspace)', () => {
        scaffold({});
        expect(assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-missing' }))._tag).toBe(
            'NoWorkspace'
        );
    });

    it('Errs when the source spec cannot be resolved (no specs dir)', () => {
        scaffold({ withSpec: false });
        expect(assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }))._tag).toBe(
            'Usage'
        );
    });

    it('Errs when the spec id does not match any spec', () => {
        scaffold({ task: TASK_BLOCK.replace('- SPEC-feat', '- SPEC-other') });
        expect(assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }))._tag).toBe(
            'Usage'
        );
    });

    it('Errs when no worktree exists for the task', () => {
        scaffold({ withWorktree: false });
        const error = assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(error.message).toContain('no worktree found');
    });

    it('Errs when the task packet has no frontmatter fence (no source resolvable)', () => {
        scaffold({ task: '# Task\n\nno frontmatter\n' });
        expect(assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }))._tag).toBe(
            'Usage'
        );
    });

    it('finds the packet past a non-.md file and a non-matching review', () => {
        scaffold({});
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'aaa.txt'), 'not a review'); // sorts first → the non-.md skip
        writeFileSync(join(repo, 'reviews', 'bbb.md'), '---\ntype: review\ntask: TASK-other\n---\n# r\n'); // a .md whose task differs
        writeFileSync(
            join(repo, 'reviews', 'feat.md'),
            '---\ntype: review\nid: REVIEW-feat\ntask: TASK-feat\nstatus: draft\n---\n# r\n'
        );
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(resolved.reviewPacketSource).toContain('REVIEW-feat');
    });

    it('falls back to the lone worktree whose branch tail matches the task slug', () => {
        scaffold({ withWorktree: false }); // no direct swarm/feat/feat worktree
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'unconventional');
        git(['worktree', 'add', '-b', 'swarm/other/feat', wt, base]); // tail 'feat' matches; the direct path does not
        writeFileSync(join(wt, 'changed.ts'), 'x');
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(resolved.diffChangedFiles).toContain('changed.ts');
    });

    it('Errs when the base ref does not exist (the diff fails)', () => {
        scaffold({});
        const error = assertErr(
            resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat', base: 'no-such-ref-xyz' })
        );
        expect(error).toBeDefined();
    });
});
