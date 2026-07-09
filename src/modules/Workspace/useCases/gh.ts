// The `gh` CLI fetch the intake prepare verb (`suspec pull`) wraps — the single impure edge for
// pulling a ticket body, kept in the Workspace leaf alongside the git ops (never inlined into an
// engine). `gh` is the GitHub CLI on PATH; this is a read-only `gh issue view`, never a write.
// Returns a Result so a missing `gh` / a failed fetch surfaces as a clean error (the caller falls
// back to a paste placeholder), never a stack trace.

import { spawnSync } from 'child_process';

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type GhFetchError = AppError<'GhFetchFailed', { ref: string; stderr: string }>;

export type GhIssue = Readonly<{ title: string; body: string; labels: readonly string[] }>;

// Fetch one issue's title + body + labels via `gh issue view <ref> --json title,body,labels`.
// `<ref>` is whatever `gh` accepts for an issue: a number, an `owner/repo#123`, or a full issue
// URL — `gh` resolves the repo itself (from the URL, or the cwd's default remote). A missing `gh`
// (spawn error) or a non-zero exit (no such issue, not authenticated, no repo) is an `Err`; the
// caller decides whether to fall back to a paste placeholder. Labels feed `suspec fix #N`'s
// provenance (AC-017); `pull` ignores them.
export function fetch_gh_issue(ref: string, opts: { cwd?: string } = {}): Result<GhIssue, GhFetchError> {
    const result = spawnSync('gh', ['issue', 'view', ref, '--json', 'title,body,labels'], {
        cwd: opts.cwd,
        encoding: 'utf8',
    });
    if (result.error) {
        return err(
            createAppError('GhFetchFailed', `gh is not installed or not in PATH (cannot fetch ${ref})`, {
                ref,
                stderr: result.error.message,
            })
        );
    }
    if (result.status !== 0) {
        const stderr =
            (result.stderr || '').trim() || `gh issue view ${ref} exited with status ${String(result.status)}`;
        return err(createAppError('GhFetchFailed', `could not fetch ${ref}: ${stderr}`, { ref, stderr }));
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse((result.stdout || '').trim());
    } catch {
        return err(createAppError('GhFetchFailed', `gh returned unreadable JSON for ${ref}`, { ref, stderr: '' }));
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return err(createAppError('GhFetchFailed', `gh returned an unexpected shape for ${ref}`, { ref, stderr: '' }));
    }
    const record = parsed as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title : '';
    const body = typeof record.body === 'string' ? record.body : '';
    // gh reports labels as [{ name, … }]; anything else reads as no labels.
    const labels = Array.isArray(record.labels)
        ? record.labels
              .map((label: unknown) =>
                  typeof label === 'object' && label !== null && typeof (label as Record<string, unknown>).name === 'string'
                      ? ((label as Record<string, unknown>).name as string)
                      : null
              )
              .filter((name): name is string => name !== null)
        : [];
    return ok({ title, body, labels });
}
