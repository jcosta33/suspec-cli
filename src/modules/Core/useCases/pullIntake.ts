// PrepareEngine.pull (AC-001, ADR-0084 D1) — snapshot a ticket into `intake/<slug>.md` and NOTHING
// else. It writes exactly one new file: the kit intake template's frontmatter (`source`/`url`/
// `captured`) followed by the upstream content *verbatim*. When `<ref>` is a `gh-issue`-style ref it
// fetches the body via the `gh` CLI (injected, so the engine is testable without a network); for any
// other ref it writes a clearly-marked verbatim-paste placeholder. It never normalizes the ticket
// and NEVER writes a spec — turning a ticket into requirements is judgment work, not transcription.
// No board is read, derived, or written.

import { join } from 'path';

import { ok, err, isOk, type Result } from '../../../infra/errors/result.ts';
import { type AppError } from '../../../infra/errors/createAppError.ts';
import { write_new_file, type GhIssue, type GhFetchError } from '../../Workspace/useCases/index.ts';
import { usage_error, type OutcomeLevel } from './unixOutcome.ts';

export type GhFetcher = (ref: string, opts: { cwd?: string }) => Result<GhIssue, GhFetchError>;

export type PullIntakeInput = Readonly<{
    workspaceDir: string;
    ref: string;
    force?: boolean;
    // Injected so the engine is exercised without spawning `gh` in tests. The command surface wires
    // the real Workspace `fetch_gh_issue`.
    fetchGhIssue: GhFetcher;
}>;

export type PullIntakeReport = Readonly<{
    level: OutcomeLevel;
    path: string;
    slug: string;
    fetched: boolean; // true when the gh body was pulled; false when a paste placeholder was written
}>;

// A `gh-issue`-style ref the gh CLI can resolve: a bare issue number, an `owner/repo#N` / `#N`, or a
// GitHub issue URL. Anything else (a Jira key, a Notion link, a freeform note) gets the paste
// placeholder. The classification only decides whether to *attempt* a fetch; a failed fetch still
// falls back to the placeholder, so a false positive is never fatal.
const GH_ISSUE_REF = /^(?:#?\d+|[\w.-]+\/[\w.-]+#\d+|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)$/i;
const OWNER_REPO_NUM = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

function is_gh_issue_ref(ref: string): boolean {
    return GH_ISSUE_REF.test(ref.trim());
}

// The form `gh issue view` accepts: a URL, a bare number (resolved against the cwd repo), or
// `--repo`-qualified. `gh` rejects the bare `owner/repo#N` shorthand ("invalid issue format"), so
// translate that one form into the equivalent issue URL `gh` does accept. A bare number / URL passes
// through unchanged. This is the value handed to the fetcher only; the recorded `url:` and the slug
// keep the ref the user typed.
function gh_view_arg(ref: string): string {
    const m = OWNER_REPO_NUM.exec(ref);
    return m === null ? ref : `https://github.com/${m[1]}/issues/${m[2]}`;
}

// Derive a filesystem-safe slug from a ref: lower-case, every run of non-alphanumerics collapsed to a
// single dash, leading/trailing dashes trimmed. `owner/repo#123` → `owner-repo-123`; a bare `42` →
// `issue-42` (a leading digit is safe, but a lone number reads better prefixed); a URL keeps its
// path tail. Empty / all-punctuation refs yield '' so the caller rejects them.
function slugify_ref(ref: string): string {
    const stripped = ref
        .trim()
        .replace(/^https?:\/\/github\.com\//i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (stripped.length === 0) {
        return '';
    }
    return /^\d+$/.test(stripped) ? `issue-${stripped}` : stripped;
}

function render_intake(input: { title: string; source: string; url: string; captured: string; body: string }): string {
    return `---
type: intake
source: ${input.source}
url: ${input.url}
captured: ${input.captured}
---

# Intake: ${input.title}

<!-- Paste the upstream content verbatim below. Don't edit it — the spec
     interprets; the intake preserves what was actually asked. -->

${input.body}
`;
}

const PASTE_PLACEHOLDER = `{{Paste the upstream ticket/PR/page content verbatim here. \`suspec pull\` could
not fetch this ref automatically — only \`gh-issue\`-style refs are fetched via the
\`gh\` CLI today (richer per-tracker connectors are deferred \`suspec-*\` plugins). Do
not normalize it: the spec interprets, the intake preserves what was actually asked.}}`;

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

export function pull_intake(input: PullIntakeInput): Result<PullIntakeReport, AppError> {
    const ref = input.ref.trim();
    if (ref.length === 0) {
        return err(usage_error('usage: suspec pull <ref> — a ticket ref (a gh issue, a URL, or a tracker key)'));
    }

    const slug = slugify_ref(ref);
    if (slug.length === 0) {
        return err(usage_error(`cannot derive an intake slug from "${ref}" — it has no slug-able characters`));
    }

    // Floor: a gh-issue ref fetches the verbatim body; everything else gets the paste placeholder. A
    // gh fetch that fails (no gh, no such issue, not authenticated) also falls back — never fatal.
    let title = ref;
    let body = PASTE_PLACEHOLDER;
    let source = '{{JIRA-123 / linear-ticket / gh-issue / gh-pr / notion-page / email / DM}}';
    let fetched = false;
    if (is_gh_issue_ref(ref)) {
        const issue = input.fetchGhIssue(gh_view_arg(ref), { cwd: input.workspaceDir });
        if (isOk(issue)) {
            title = issue.value.title.length > 0 ? issue.value.title : ref;
            body = issue.value.body.length > 0 ? issue.value.body : PASTE_PLACEHOLDER;
            source = 'gh-issue';
            fetched = true;
        }
    }

    const content = render_intake({
        title,
        source,
        url: ref,
        captured: today(),
        body,
    });

    const path = join(input.workspaceDir, 'intake', `${slug}.md`);
    // No-clobber (AC-004): an existing snapshot is an error unless `--force`, and exactly this one
    // file is written — the workspace is otherwise byte-unchanged. NO spec is ever written.
    const written = write_new_file(path, content, { overwrite: input.force === true });
    if (!written.ok) {
        return err(written.error);
    }

    return ok({ level: 'clean', path, slug, fetched });
}
