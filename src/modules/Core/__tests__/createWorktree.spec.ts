import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { create_worktree } from '../useCases/createWorktree.ts';
import { remove_worktree } from '../useCases/removeWorktree.ts';

// The ahead-of-remote advisory (swarm-hq #46): create_worktree reports how far the base branch is ahead
// of its remote so the command can warn that a PR cut from the worktree would carry unpushed base
// commits. The probe is injectable, so the advisory is exercised here without a real remote; the git
// orchestration runs against a throwaway repo. The advisory is non-fatal — the level stays clean.

let repoRoot: string;
let baseBranch: string;

const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

beforeAll(() => {
    repoRoot = realpathSync(mkdtempSync(join(tmpdir(), 'swarm-ahead-')));
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    git(['commit', '--allow-empty', '-m', 'init']);
    baseBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
});

afterAll(() => {
    rmSync(repoRoot, { recursive: true, force: true });
});

describe('create_worktree — base ahead-of-remote advisory (#46)', () => {
    it('reports the ahead count from the injected probe, staying clean (advisory, non-fatal)', () => {
        const created = assertOk(
            create_worktree({ repoRoot, specSlug: 'ahead-spec', baseBranch, aheadOfRemote: () => 3 })
        );
        expect(created.baseAheadOfRemote).toBe(3);
        expect(created.level).toBe('clean');
        assertOk(remove_worktree({ repoRoot, specSlug: 'ahead-spec', force: true }));
    });

    it('reports null when there is no remote to compare against', () => {
        const created = assertOk(
            create_worktree({ repoRoot, specSlug: 'noremote-spec', baseBranch, aheadOfRemote: () => null })
        );
        expect(created.baseAheadOfRemote).toBeNull();
        expect(created.level).toBe('clean');
        assertOk(remove_worktree({ repoRoot, specSlug: 'noremote-spec', force: true }));
    });
});
