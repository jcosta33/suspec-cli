// Create a GitHub issue via the gh CLI (SPEC-suspec-v2 AC-015's promote arm) — the Workspace
// write edge Core's promote_finding receives injected. `gh issue create` prints the new issue's
// URL; the trailing number is lifted from it for the finding's `issue: #N` stamp (null when the
// URL shape is unexpected — the URL itself is still the durable ref). An Err creates nothing.

import { spawnSync } from 'child_process';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type CreatedIssue = Readonly<{ number: number | null; url: string }>;

export function create_gh_issue(
    input: Readonly<{ title: string; body: string; cwd: string }>
): Result<CreatedIssue, AppError> {
    const result = spawnSync('gh', ['issue', 'create', '--title', input.title, '--body', input.body], {
        cwd: input.cwd,
        encoding: 'utf8',
    });
    if (result.error) {
        return err(
            createAppError('gh_issue_create_failed', 'gh is not installed or not in PATH', {}, result.error)
        );
    }
    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim() || `gh issue create exited with status ${String(result.status)}`;
        return err(createAppError('gh_issue_create_failed', `could not create the issue: ${stderr}`, { stderr }));
    }
    const url = (result.stdout || '').trim();
    const match = /\/(\d+)\s*$/.exec(url);
    return ok({ number: match !== null ? Number.parseInt(match[1], 10) : null, url });
}
