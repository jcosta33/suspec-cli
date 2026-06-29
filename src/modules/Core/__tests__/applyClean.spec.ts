import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { apply_clean } from '../useCases/applyClean.ts';
import type { CleanCandidate } from '../useCases/scanCleanCandidates.ts';

let repo: string;
const git = (args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

beforeEach(() => {
    repo = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-applyclean-')));
    git(['init']);
    git(['config', 'user.email', 't@e.com']);
    git(['config', 'user.name', 'T']);
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

const candidate = (path: string, kind: 'task' | 'review', status: string): CleanCandidate => ({
    path,
    kind,
    id: null,
    status,
});

describe('apply_clean (SPEC-suspec-clean --apply; ADR-0096/0104)', () => {
    it('archives a committed (tracked) candidate and deletes a gitignored one', () => {
        // a committed review (tracked) → archive; a gitignored task (untracked) → delete
        mkdirSync(join(repo, 'reviews'), { recursive: true });
        writeFileSync(join(repo, 'reviews', 'committed.md'), 'r\n');
        git(['add', '.']);
        git(['commit', '-m', 'review']);
        mkdirSync(join(repo, 'tasks'), { recursive: true });
        writeFileSync(join(repo, '.gitignore'), 'tasks/\n');
        writeFileSync(join(repo, 'tasks', 'ignored.md'), 't\n');

        const result = assertOk(
            apply_clean({
                workspaceDir: repo,
                repoRoot: repo,
                candidates: [candidate('reviews/committed.md', 'review', 'pass'), candidate('tasks/ignored.md', 'task', 'closed')],
            })
        );

        expect(result.archived).toEqual(['reviews/committed.md']);
        expect(result.deleted).toEqual(['tasks/ignored.md']);
        // committed file moved under archive/, preserving its reviews/ subpath
        expect(existsSync(join(repo, 'archive', 'reviews', 'committed.md'))).toBe(true);
        expect(existsSync(join(repo, 'reviews', 'committed.md'))).toBe(false);
        // gitignored file gone
        expect(existsSync(join(repo, 'tasks', 'ignored.md'))).toBe(false);
    });

    it('skips a candidate whose file no longer exists', () => {
        const result = assertOk(
            apply_clean({ workspaceDir: repo, repoRoot: repo, candidates: [candidate('reviews/ghost.md', 'review', 'pass')] })
        );
        expect(result.deleted).toEqual([]);
        expect(result.archived).toEqual([]);
        expect(result.level).toBe('clean');
    });

    it('an empty candidate set is a clean no-op', () => {
        const result = assertOk(apply_clean({ workspaceDir: repo, repoRoot: repo, candidates: [] }));
        expect(result.deleted).toEqual([]);
        expect(result.archived).toEqual([]);
    });

    it('refuses a candidate whose path escapes the workspace (defense-in-depth)', () => {
        const outside = realpathSync(mkdtempSync(join(tmpdir(), 'suspec-outside-')));
        const sentinel = join(outside, 'keep.md');
        writeFileSync(sentinel, 'do not touch\n');
        const escaping = relative(repo, sentinel); // ../suspec-outside-xxx/keep.md
        const result = assertOk(
            apply_clean({ workspaceDir: repo, repoRoot: repo, candidates: [candidate(escaping, 'review', 'pass')] })
        );
        const untouched = existsSync(sentinel);
        rmSync(outside, { recursive: true, force: true });
        expect(result.deleted).toEqual([]);
        expect(result.archived).toEqual([]);
        expect(untouched).toBe(true); // the escaping path was refused, the outside file is intact
    });
});
