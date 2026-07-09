// Does the run's branch have an OPEN pull request? (SPEC-suspec-v2 AC-014.) A read-only
// `gh pr view <branch> --json number,state` through the gh CLI on PATH — the Workspace edge the
// `done` digest consults before upserting the living PR comment. Deliberately NOT a Result: a
// missing gh, no PR, or a closed PR are all the same non-event ("skip silently with a note"),
// so the shape is `{ pr, note }` — a number when an open PR exists, else null plus the note.

import { spawnSync } from 'child_process';

export type OpenPrProbe = Readonly<{ pr: number | null; note: string | null }>;

export function find_open_pr(branch: string, cwd: string): OpenPrProbe {
    const result = spawnSync('gh', ['pr', 'view', branch, '--json', 'number,state'], { cwd, encoding: 'utf8' });
    if (result.error) {
        return { pr: null, note: 'gh is not installed — skipping the PR comment' };
    }
    if (result.status !== 0) {
        return { pr: null, note: `no open PR for ${branch} — skipping the PR comment` };
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse((result.stdout || '').trim());
    } catch {
        return { pr: null, note: 'gh returned unreadable JSON — skipping the PR comment' };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return { pr: null, note: 'gh returned an unexpected shape — skipping the PR comment' };
    }
    const record = parsed as Record<string, unknown>;
    if (record.state !== 'OPEN' || typeof record.number !== 'number') {
        return { pr: null, note: `no open PR for ${branch} — skipping the PR comment` };
    }
    return { pr: record.number, note: null };
}
