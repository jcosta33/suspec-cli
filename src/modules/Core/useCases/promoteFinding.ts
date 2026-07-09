// Promote one store finding to a GitHub issue (SPEC-suspec-v2 AC-015's `promote` triage arm and
// the engine under the `suspec promote <FIND>` command face, AC-016).
// The gh write is INJECTED (the Workspace edge), so Core never names the gh CLI: create
// the issue from the finding's title + body, record the issue ref back into the frontmatter, and
// archive the finding — promotion is the durability hand-off (ADR-0137), so the transient copy
// retires. Any gh failure leaves the finding in place, untouched.

import { readFileSync } from 'fs';
import { join } from 'path';

import { ok, err, isErr, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { upsert_frontmatter } from '../services/readFrontmatter.ts';
import { archive_artifact } from './archiveArtifact.ts';
import { write_store_artifact } from './writeStoreArtifact.ts';

// The injected gh edge: create an issue, return its number + url. An Err means nothing was created.
export type IssueCreator = (input: {
    title: string;
    body: string;
}) => Result<{ number: number | null; url: string }, AppError>;

export type PromoteFindingInput = Readonly<{
    storeDir: string;
    filename: string; // the flat store basename (listed by list_open_findings — never a raw path)
    createIssue: IssueCreator;
    // Appended to the ISSUE body only (never the archived file): the `suspec promote` face sends
    // the evidence digest + provenance label here (AC-016); `done`'s triage arm sends none.
    bodyFooter?: string;
}>;

export type PromoteFindingReport = Readonly<{
    filename: string;
    issueUrl: string;
    archivedPath: string;
}>;

export function promote_finding(input: PromoteFindingInput): Result<PromoteFindingReport, AppError> {
    const path = join(input.storeDir, input.filename);
    let source: string;
    try {
        source = readFileSync(path, 'utf8');
    } catch (cause) {
        return err(createAppError('finding_unreadable', `could not read the finding at ${path}`, { path }, cause));
    }
    const heading = /^#\s+(.+)$/m.exec(source);
    const title = heading !== null ? heading[1].trim() : input.filename.replace(/\.md$/, '');

    const body = input.bodyFooter !== undefined ? `${source.trimEnd()}\n\n${input.bodyFooter}\n` : source;
    const created = input.createIssue({ title, body });
    if (isErr(created)) {
        return err(created.error);
    }

    // Record the durable ref, then archive — the issue now owns the finding's future.
    const stamped = upsert_frontmatter(source, {
        status: 'promoted',
        issue: created.value.number !== null ? `#${created.value.number}` : created.value.url,
    });
    const written = write_store_artifact(path, stamped);
    if (isErr(written)) {
        return err(written.error);
    }
    const archived = archive_artifact(input.storeDir, input.filename);
    if (isErr(archived)) {
        return err(archived.error);
    }
    return ok({ filename: input.filename, issueUrl: created.value.url, archivedPath: archived.value.archivedPath });
}
