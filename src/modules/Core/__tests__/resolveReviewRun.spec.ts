import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { resolve_review_run } from '../useCases/resolveReviewRun.ts';
import { derive_board } from '../useCases/deriveBoard.ts';
import { show_artifact } from '../useCases/showArtifact.ts';
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
        git(['worktree', 'add', '-b', 'suspec/feat/feat', wt, base]);
        writeFileSync(join(wt, 'changed.ts'), 'x');
    }
}

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-resolve-')));
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
        scaffold({ withWorktree: false }); // no direct suspec/feat/feat worktree
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'unconventional');
        git(['worktree', 'add', '-b', 'suspec/other/feat', wt, base]); // tail 'feat' matches; the direct path does not
        writeFileSync(join(wt, 'changed.ts'), 'x');
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(resolved.diffChangedFiles).toContain('changed.ts');
    });

    it('does NOT fall back to a NON-suspec branch whose tail matches the slug (#24)', () => {
        scaffold({ withWorktree: false }); // no suspec/feat/feat worktree
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
        const wt = join(repo, '.worktrees', 'feature-feat');
        git(['worktree', 'add', '-b', 'feature/feat', wt, base]); // a non-suspec branch whose tail is 'feat'
        writeFileSync(join(wt, 'changed.ts'), 'x');
        // The fallback is restricted to suspec/* branches, so this unrelated worktree is not used.
        const error = assertErr(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat' }));
        expect(error).toBeDefined();
    });

    it('Errs when the base ref does not exist (the diff fails)', () => {
        scaffold({});
        const error = assertErr(
            resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: 'TASK-feat', base: 'no-such-ref-xyz' })
        );
        expect(error).toBeDefined();
    });

    // The canonical-key regression (blind field test 2026-06-20): with ONE set of artifacts — the
    // id-named task file `tasks/TASK-feat.md` and a review bound by the task id (`task: TASK-feat`, the
    // kit-template form) — `show`, `review`, and `status` must all resolve the SAME task and review,
    // whether the CLI arg is the bare slug or the TASK- id, with NO manual rename.
    it('new -> show -> review -> status all resolve one task/review by either arg form, no rename', () => {
        scaffold({ review: '---\ntype: review\nid: REVIEW-feat\ntask: TASK-feat\nstatus: draft\n---\n# r\n' });

        for (const arg of ['feat', 'TASK-feat']) {
            // show task resolves the id-named file from either arg form.
            const shown = assertOk(show_artifact({ workspaceDir: repo, kind: 'task', ref: arg }));
            expect((shown.value as { id: string }).id).toBe('TASK-feat');

            // review finds the SAME packet via the canonical task id (not the raw arg) from either form.
            const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: repo, task: arg }));
            expect(resolved.task).toBe('TASK-feat');
            expect(resolved.reviewPacketSource).toContain('REVIEW-feat');
        }

        // status (derive_board) binds the SAME review (task: TASK-feat) to the SAME task (id TASK-feat) —
        // no opposite-value conflict in the `task:` field.
        const board = assertOk(derive_board({ workspaceDir: repo }));
        const task = board.specs.flatMap((spec) => spec.tasks).find((t) => t.id === 'TASK-feat');
        expect(task?.hasReview).toBe(true);
        expect(task?.reviewStatus).toBe('draft');
    });

    // #2 (split-repo review): the workspace (artifacts) and the code repo (worktree + diff) are SEPARATE
    // git repos — the documented dedicated-workspace layout that round-1 hit "no worktree found" on. The
    // command wires repoRoot via `--repo`; here we pass a distinct repoRoot directly.
    it('reconciles when the workspace and the code repo are separate git repos (--repo / split layout)', () => {
        scaffold({
            withWorktree: false,
            review: '---\ntype: review\nid: REVIEW-feat\ntask: TASK-feat\nstatus: draft\n---\n# r\n',
        });
        const codeRepo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-code-')));
        git(['init'], codeRepo);
        git(['config', 'user.email', 't@e.com'], codeRepo);
        git(['config', 'user.name', 'T'], codeRepo);
        writeFileSync(join(codeRepo, 'seed.ts'), 'x');
        git(['add', '.'], codeRepo);
        git(['commit', '-m', 'init'], codeRepo);
        const base = git(['rev-parse', '--abbrev-ref', 'HEAD'], codeRepo).trim();
        const wt = join(codeRepo, '.worktrees', 'feat-feat');
        git(['worktree', 'add', '-b', 'suspec/feat/feat', wt, base], codeRepo);
        writeFileSync(join(wt, 'changed.ts'), 'x');

        // artifacts resolve from the workspace `repo`; the worktree + diff resolve from `codeRepo`.
        const resolved = assertOk(resolve_review_run({ workspaceDir: repo, repoRoot: codeRepo, task: 'feat' }));
        expect(resolved.diffChangedFiles).toContain('changed.ts');
        expect(resolved.reviewPacketSource).toContain('REVIEW-feat');
        rmSync(codeRepo, { recursive: true, force: true });
    });
});
