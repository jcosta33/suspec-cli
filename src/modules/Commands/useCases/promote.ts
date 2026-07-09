#!/usr/bin/env node

// `suspec promote <FIND>` — promotion is the durability hand-off (SPEC-suspec-v2 AC-016;
// ADR-0137): resolve one OPEN finding from the repo's store, create the GitHub issue from it
// (title from the finding's title; body = the finding body + the linked run's evidence digest +
// the provenance label), record the issue number back into the finding's frontmatter, and archive
// it — the issue owns the finding's future, the transient copy retires. The gh write is the
// injected Workspace edge; a gh failure leaves the finding open and untouched.
// (The v1 `promote <task>` workspace-finding scaffold this replaces lived on the retired
// workspace model — findings now enter the store via runs, never via a scaffold.)
//   suspec promote <FIND>            FIND = a finding id (frontmatter `id:`) or store filename
//   suspec promote <FIND> --json     machine output
// Exits: 0 promoted · 1 gh missing/failing (the dependency named — AC-025; nothing changed) ·
// 2 usage / no store / unknown finding.

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    is_safe_segment,
    resolve_store_dir,
    find_store_finding,
    list_evidence_records,
    promote_finding,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, create_gh_issue } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

const USAGE = 'usage: suspec promote <FIND> [--json] — promote a store finding to a GitHub issue';

// The issue-body footer (AC-016): the linked run's evidence digest — refs and facts, never raw
// output — plus the provenance label tying the issue back to the store finding.
function issue_footer(
    storeDir: string,
    finding: Readonly<{ filename: string; id: string | null; run: string | null }>
): string {
    const records = finding.run !== null ? list_evidence_records(storeDir, finding.run) : [];
    const digest =
        records.length > 0
            ? records.map(
                  (record) =>
                      `- ${record.ac ?? 'unmapped'}: \`${record.command ?? 'unknown command'}\` → exit ${
                          record.exit ?? '?'
                      } (${record.provenance ?? 'unknown provenance'})`
              )
            : ['- no evidence records for this run'];
    return [
        '---',
        '',
        '## Evidence digest',
        '',
        ...digest,
        '',
        `Provenance: suspec finding ${finding.id ?? finding.filename} · run ${finding.run ?? 'unknown'} · promoted by \`suspec promote\``,
    ].join('\n');
}

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json'], strings: [] });
    const json = flags.get('json') === true;
    const ref = positional[0];

    if (ref === undefined || !is_safe_segment(ref)) {
        return emit_error(usage_error(`${USAGE}\n  <FIND> is a finding id or store filename, never a path`), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    // Probe-only: a repo with no store has no findings — never create the dir on an error path.
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return emit_error(usage_error(`no finding ${ref}: this repo has no store yet`), json);
    }
    const storeDir = store.value.storeDir;

    // Open findings only — an archived finding already retired (promoted or discarded).
    const finding = find_store_finding(storeDir, ref);
    if (finding === null) {
        return emit_error(usage_error(`no open finding ${ref} in ${storeDir} (searched finding-*.md)`), json);
    }

    const promoted = promote_finding({
        storeDir,
        filename: finding.filename,
        bodyFooter: issue_footer(storeDir, finding),
        createIssue: (issue) => create_gh_issue({ ...issue, cwd: repoRoot }),
    });
    if (isErr(promoted)) {
        // AC-025: promotion is the command that needs gh — a missing/failing gh names the
        // dependency and exits 1; the finding stays open in the store, byte-untouched.
        if (promoted.error._tag === 'gh_issue_create_failed') {
            return project({
                result: {
                    ok: true,
                    value: {
                        level: 'warning' as const,
                        refused: 'gh' as const,
                        finding: finding.filename,
                        message: promoted.error.message,
                    },
                },
                json,
                render: (v) =>
                    `promotion needs the gh CLI — ${v.message}\n  the finding stays open in the store: ${v.finding}`,
            });
        }
        return emit_error(promoted.error, json);
    }

    return project({
        result: {
            ok: true,
            value: {
                level: 'clean' as const,
                finding: promoted.value.filename,
                issue_url: promoted.value.issueUrl,
                archived_path: promoted.value.archivedPath,
            },
        },
        json,
        render: (v) =>
            `promoted ${v.finding} → ${v.issue_url}\n` +
            `  the issue ref is stamped in the finding's frontmatter\n` +
            `  archived: ${v.archived_path}`,
    });
}
