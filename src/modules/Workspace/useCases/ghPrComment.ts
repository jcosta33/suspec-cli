// Upsert THE one marker-tagged PR comment (SPEC-suspec-v2 AC-014): find the existing comment by
// its marker via `gh api` (list the PR's issue comments), then PATCH it in place — or POST a
// fresh one when absent. Never a second comment for the same marker, so `done` re-runs edit the
// living digest instead of stacking. `gh pr comment --edit-last` is unreliable for this (it edits
// whatever comment happens to be last), so the lookup is by marker, the write by comment id. The
// new body comes from the injected builder, fed the existing comment's body — the caller merges
// its marker block (markerBlock semantics) without this edge knowing the digest's shape.

import { spawnSync } from 'child_process';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type UpsertPrCommentInput = Readonly<{
    cwd: string;
    pr: number;
    marker: string; // the start marker identifying the one managed comment
    buildBody: (existingBody: string | null) => string;
}>;

export type UpsertPrCommentReport = Readonly<{ action: 'created' | 'edited'; commentId: number | null }>;

type GhComment = Readonly<{ id: number; body: string }>;

function gh_api(args: string[], cwd: string): Result<string, AppError> {
    const result = spawnSync('gh', ['api', ...args], { cwd, encoding: 'utf8' });
    if (result.error) {
        return err(
            createAppError('gh_api_failed', `gh is not installed or not in PATH`, {}, result.error)
        );
    }
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `gh api exited with status ${String(result.status)}`;
        return err(createAppError('gh_api_failed', `gh api failed: ${stderr}`, { stderr }));
    }
    return ok(result.stdout || '');
}

function parse_comments(raw: string): GhComment[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw.trim().length > 0 ? raw : '[]');
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) {
            return [];
        }
        const record = entry as Record<string, unknown>;
        return typeof record.id === 'number' && typeof record.body === 'string'
            ? [{ id: record.id, body: record.body }]
            : [];
    });
}

export function upsert_pr_comment(input: UpsertPrCommentInput): Result<UpsertPrCommentReport, AppError> {
    // 1. Find the managed comment by marker. `{owner}/{repo}` placeholders resolve from cwd's remote.
    const listed = gh_api([`repos/{owner}/{repo}/issues/${input.pr}/comments`, '--paginate'], input.cwd);
    if (listed.ok === false) {
        return err(listed.error);
    }
    const existing = parse_comments(listed.value).find((comment) => comment.body.includes(input.marker)) ?? null;

    // 2. Edit in place, or create — one comment per marker, ever.
    if (existing !== null) {
        const patched = gh_api(
            [
                `repos/{owner}/{repo}/issues/comments/${existing.id}`,
                '-X',
                'PATCH',
                '-f',
                `body=${input.buildBody(existing.body)}`,
            ],
            input.cwd
        );
        if (patched.ok === false) {
            return err(patched.error);
        }
        return ok({ action: 'edited', commentId: existing.id });
    }
    const posted = gh_api(
        [`repos/{owner}/{repo}/issues/${input.pr}/comments`, '-f', `body=${input.buildBody(null)}`],
        input.cwd
    );
    if (posted.ok === false) {
        return err(posted.error);
    }
    return ok({ action: 'created', commentId: parse_created_id(posted.value) });
}

function parse_created_id(raw: string): number | null {
    try {
        const record = JSON.parse(raw) as Record<string, unknown>;
        return typeof record.id === 'number' ? record.id : null;
    } catch {
        return null;
    }
}
