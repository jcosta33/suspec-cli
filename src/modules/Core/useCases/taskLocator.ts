// Locate a task's workspace + git facts from a task id/slug — the shared resolution both the review
// reconcile (resolveReviewRun) and the launch (resolveLaunch) build on. Reads the workspace + git
// porcelain; writes nothing. Extracted so the two resolvers share one task→spec→worktree path rather
// than each re-deriving the ADR-0046 branch layout. A Core use-case (not a pure service): it does fs +
// git IO through the Workspace barrel.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { worktree_list } from '../../Workspace/useCases/index.ts';

// A located worktree: its path and the branch it has checked out (null only if detached/unborn).
export type ResolvedWorktree = Readonly<{ path: string; branch: string | null }>;

// Read the frontmatter scalar `key:` from a markdown file's leading fence (a one-key scan — the
// reconcile engine owns the real parsing). Matches a task packet's `source:` and a review's `task:`.
export function frontmatter_value(source: string, key: string): string | null {
    const lines = source.split(/\r\n|[\r\n]/);
    if (lines[0] !== '---') {
        return null;
    }
    const inline = new RegExp(`^${key}:\\s*(.+)$`);
    const bare = new RegExp(`^${key}:\\s*$`);
    for (let index = 1; index < lines.length && lines[index] !== '---'; index += 1) {
        const match = inline.exec(lines[index]);
        if (match !== null) {
            return match[1].trim();
        }
        // A block list (`source:` then `- SPEC-x`): take the first item.
        if (bare.test(lines[index])) {
            const item = /^\s*-\s+(.*)$/.exec(lines[index + 1] ?? '');
            return item !== null ? item[1].trim().split(/\s+/)[0] : null;
        }
    }
    return null;
}

// The source spec for a task: the specs/*/spec.md whose frontmatter id matches the packet's `source:`
// spec id. Returns the path + enclosing slug (the worktree branch's spec segment, ADR-0046).
export function find_source_spec(workspaceDir: string, specId: string): { path: string; slug: string } | null {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return null;
    }
    for (const slug of readdirSync(specsDir).sort()) {
        const specPath = join(specsDir, slug, 'spec.md');
        if (existsSync(specPath) && frontmatter_value(readFileSync(specPath, 'utf8'), 'id') === specId) {
            return { path: specPath, slug };
        }
    }
    return null;
}

// The task's worktree (path + branch). The branch follows `swarm/<spec-slug>/<task-slug>` (ADR-0046);
// the task-slug is the task id minus a leading `TASK-`, lower-cased. Falls back to the lone swarm
// worktree whose branch's final segment matches, so an unconventional layout still resolves. One
// `worktree list` call returns both path and branch together. Null = none found.
export function resolve_worktree(repoRoot: string, specSlug: string, taskId: string): ResolvedWorktree | null {
    const taskSlug = taskId.replace(/^TASK-/i, '').toLowerCase();
    const list = worktree_list(repoRoot);
    const direct = list.find((entry) => entry.branch === `swarm/${specSlug}/${taskSlug}`);
    if (direct !== undefined) {
        return direct;
    }
    const matches = list.filter((entry) => entry.branch !== null && entry.branch.split('/').pop() === taskSlug);
    return matches.length === 1 ? matches[0] : null;
}
