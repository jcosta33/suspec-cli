#!/usr/bin/env node

// `suspec done <RUN>` — the strict evidence gate (SPEC-suspec-v2 AC-011..015). In order:
//   1. artifact lint (AC-013): the deterministic checks re-aimed at the run's STORE artifacts —
//      spec, run record, review packet if present, evidence records (forged cli-verified claims
//      are hard-errors). Per-artifact facts; NO workspace verdict.
//   2. the gate (AC-011/012): every AC in the driving spec needs ≥1 cli-verified, exit-0,
//      NON-STALE evidence record (`done` re-hashes each record's worktree — drifted evidence is
//      stale and does not satisfy). Strict by default: any gap blocks with exit 1 listing it.
//      `--accept-failing "<why>"` accepts explicitly (the reason lands in the digest AND the run
//      file); `--allow-agent-evidence` lets `provenance: agent` exit-0 records count (labeled).
//   3. the digest (AC-014): per AC — command, exit, evidence REF (raw output NEVER leaves the
//      store) — to stdout, and upserted as ONE marker-tagged living comment on the branch's open
//      PR (created once, edited in place on re-run; gh absent / no PR → skipped with a note).
//   4. triage (AC-015): each open finding linked to the run — promote (gh issue + archive), keep
//      (expiry stamped), or discard (archive; a `severity: critical` finding is REFUSED unless
//      `--discard-critical <id>` names it). Non-interactive (`--json`/no TTY) defers untriaged
//      findings with an expiry stamp + a note.
// On pass (or accepted) the run file is marked `status: done`.
//   suspec done <RUN> [--accept-failing "<why>"] [--allow-agent-evidence]
//                     [--discard-critical <id>] [--json]
// Exits: 0 gate satisfied (or accepted) · 1 gate blocked (gaps listed) · 2 usage / no such run /
// lint hard-error (a forged or structurally broken artifact set has no honest gate to run).

import { existsSync } from 'fs';
import { join } from 'path';

import { isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    is_safe_segment,
    resolve_store_dir,
    write_store_artifact,
    read_run_state,
    run_filename,
    lint_run_artifacts,
    list_evidence_records,
    verify_evidence_capture,
    gate_evidence,
    render_digest,
    digest_markers,
    build_digest_comment_body,
    done_run_content,
    list_open_findings,
    stamp_finding_expiry,
    promote_finding,
    archive_artifact,
    risk_path_nudge,
} from '../../Core/useCases/index.ts';
import {
    resolve_repo_root,
    worktree_diff_digest,
    worktree_changed_files,
    default_branch,
    find_open_pr,
    upsert_pr_comment,
    create_gh_issue,
} from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { run_triage_flow, create_clack_prompter, type Prompter } from '../../Tui/useCases/index.ts';

const USAGE =
    'usage: suspec done <RUN> [--accept-failing "<why>"] [--allow-agent-evidence] [--discard-critical <id>] [--json]';

type TriageOutcome = Readonly<{ finding: string; action: string; detail: string }>;

// The finding fields triage keys on (structurally satisfied by list_open_findings' entries —
// use-case types never cross module roots, so the shape is local).
type TriageTarget = Readonly<{ filename: string; id: string | null; severity: string | null }>;

// Apply one triage decision. The critical-discard guard lives HERE (AC-015): a `severity:
// critical` finding is never archived unless --discard-critical named it (by id or filename).
function apply_triage(
    storeDir: string,
    repoRoot: string,
    finding: TriageTarget,
    action: string,
    discardCritical: string | undefined
): TriageOutcome {
    if (action === 'promote') {
        const promoted = promote_finding({
            storeDir,
            filename: finding.filename,
            createIssue: (issue) => create_gh_issue({ ...issue, cwd: repoRoot }),
        });
        return isErr(promoted)
            ? { finding: finding.filename, action: 'promote-failed', detail: promoted.error.message }
            : { finding: finding.filename, action: 'promoted', detail: promoted.value.issueUrl };
    }
    if (action === 'discard') {
        if (finding.severity === 'critical' && discardCritical !== finding.id && discardCritical !== finding.filename) {
            return {
                finding: finding.filename,
                action: 'discard-refused',
                detail: `severity: critical — a critical finding is never discarded by default; re-run with --discard-critical ${finding.id ?? finding.filename}`,
            };
        }
        const archived = archive_artifact(storeDir, finding.filename);
        return isErr(archived)
            ? { finding: finding.filename, action: 'discard-failed', detail: archived.error.message }
            : { finding: finding.filename, action: 'discarded', detail: archived.value.archivedPath };
    }
    // keep and defer both stamp the expiry — defer is the non-interactive default (AC-015).
    const stamped = stamp_finding_expiry({ storeDir, filename: finding.filename });
    return isErr(stamped)
        ? { finding: finding.filename, action: `${action}-failed`, detail: stamped.error.message }
        : {
              finding: finding.filename,
              action: action === 'defer' ? 'deferred' : 'kept',
              detail: `expires ${stamped.value.expires}`,
          };
}

// AC-022: the risk-path nudge — one advisory line when the run's worktree diff touches a
// `risk_paths` glob. Advisory by construction: a gone worktree or an undiffable base is silence,
// never a block and never an error.
function risk_nudge_for_run(repoRoot: string, worktree: string | null): string | null {
    if (worktree === null || !existsSync(worktree)) {
        return null;
    }
    const changed = worktree_changed_files(worktree, default_branch(repoRoot));
    if (isErr(changed)) {
        return null;
    }
    return risk_path_nudge(repoRoot, changed.value);
}

export async function run(argv: string[], cwd: string = process.cwd(), prompter?: Prompter): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--allow-agent-evidence'],
        strings: ['--accept-failing', '--discard-critical'],
    });
    const json = flags.get('json') === true;
    const allowAgent = flags.get('allow-agent-evidence') === true;
    const acceptFlag = flags.get('accept-failing');
    // Whitespace-collapsed: the reason lands on a single frontmatter line in the run file — a
    // newline inside it would otherwise inject arbitrary frontmatter keys.
    const acceptReason =
        typeof acceptFlag === 'string' && acceptFlag.trim().length > 0 ? acceptFlag.trim().replace(/\s+/g, ' ') : null;
    const discardFlag = flags.get('discard-critical');
    const discardCritical = typeof discardFlag === 'string' ? discardFlag : undefined;
    const runRef = positional[0];

    if (runRef === undefined || !is_safe_segment(runRef)) {
        return emit_error(usage_error(`${USAGE}\n  <RUN> is a run slug, never a path`), json);
    }
    // `--accept-failing` requires the why — an empty reason is a silent waiver, refused.
    if (acceptFlag !== undefined && acceptReason === null) {
        return emit_error(usage_error('--accept-failing requires a non-empty reason ("<why>")'), json);
    }

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;
    const store = resolve_store_dir({ repoRoot });
    if (isErr(store)) {
        return emit_error(store.error, json);
    }
    const storeDir = store.value.storeDir;
    const runPath = join(storeDir, run_filename(runRef));
    const runState = read_run_state(runPath);
    if (runState === null) {
        return emit_error(usage_error(`no run ${runRef} in the store (searched ${runPath})`), json);
    }

    // 1. Artifact lint (AC-013). A hard-error — a forged evidence record, an unresolvable driving
    // spec — means there is no honest gate to run: report and exit 2.
    const lint = lint_run_artifacts({ storeDir, repoRoot, runSlug: runRef });
    if (isErr(lint)) {
        return emit_error(lint.error, json);
    }
    const lintLines = lint.value.artifacts
        .filter((artifact) => artifact.diagnostics.length > 0)
        .flatMap((artifact) => [
            `  ${artifact.path}`,
            ...artifact.diagnostics.map((d) => `    ${d.check} ${d.severity}: ${d.message}`),
        ]);

    if (lint.value.level === 'blocking' || lint.value.requirements === null) {
        return project({
            result: { ok: true, value: { level: 'blocking' as const, run: runRef, lint: lint.value.artifacts } },
            json,
            render: () =>
                ['artifact lint blocked — fix the artifacts, then re-run `suspec done`:', ...lintLines].join('\n'),
        });
    }

    // 2. The gate (AC-011/012). Staleness recomputes per record against the worktree it recorded.
    const records = list_evidence_records(storeDir, runRef);
    const gate = gate_evidence({
        requirements: lint.value.requirements,
        records,
        allowAgentEvidence: allowAgent,
        captureVerified: (record) => verify_evidence_capture(storeDir, runRef, record),
        isStale: (record) => {
            if (record.worktreeDiffSha === null || record.worktree === null) {
                return true;
            }
            return worktree_diff_digest(record.worktree) !== record.worktreeDiffSha;
        },
    });
    const passed = gate.gaps.length === 0;
    const accepted = !passed && acceptReason !== null;

    const digest = {
        runSlug: runRef,
        specId: lint.value.specId ?? 'unknown',
        rows: gate.rows,
        acceptedFailing: accepted ? acceptReason : null,
        agentEvidenceAllowed: allowAgent,
    };
    const digestText = render_digest(digest);
    const notes: string[] = [];
    const nudge = risk_nudge_for_run(repoRoot, runState.lock.worktree);
    if (nudge !== null) {
        notes.push(nudge);
    }

    // 3a. Mark the run done — pass or explicit acceptance (AC-011); the reason is stamped in.
    if (passed || accepted) {
        const marked = done_run_content(runState.content, accepted ? acceptReason : null);
        const written = write_store_artifact(runPath, marked);
        if (isErr(written)) {
            notes.push(`warning: could not mark the run done at ${runPath}`);
        }
    }

    // 3b. The living PR comment (AC-014): only refs travel; gh absent / no PR skips with a note.
    const branchName = runState.lock.branch;
    if (branchName === null) {
        notes.push('note: the run records no branch — skipping the PR comment');
    } else {
        const probe = find_open_pr(branchName, repoRoot);
        if (probe.pr === null) {
            notes.push(`note: ${probe.note ?? 'no PR'}`);
        } else {
            const upserted = upsert_pr_comment({
                cwd: repoRoot,
                pr: probe.pr,
                marker: digest_markers(runRef).start,
                buildBody: (existing) => build_digest_comment_body(existing, digest),
            });
            notes.push(
                isErr(upserted)
                    ? `note: PR comment skipped — ${upserted.error.message}`
                    : `note: PR #${probe.pr} digest comment ${upserted.value.action}`
            );
        }
    }

    // 4. Triage (AC-015) — only a run that actually finished (passed/accepted) triages its findings.
    const outcomes: TriageOutcome[] = [];
    if (passed || accepted) {
        const findings = list_open_findings(storeDir, runRef);
        if (findings.length > 0) {
            /* v8 ignore next 2 -- the TTY default constructs the real clack prompter; tests inject the mock */
            const interactive = prompter ?? (process.stdout.isTTY === true && !json ? create_clack_prompter() : null);
            let decisions: readonly { filename: string; action: string }[];
            if (interactive !== null && !json) {
                decisions = await run_triage_flow(
                    interactive,
                    findings.map((finding) => ({
                        filename: finding.filename,
                        title: finding.title,
                        severity: finding.severity,
                    }))
                );
            } else {
                decisions = findings.map((finding) => ({ filename: finding.filename, action: 'defer' }));
                notes.push(
                    `note: ${findings.length} untriaged finding(s) deferred with an expiry stamp (non-interactive)`
                );
            }
            for (const decision of decisions) {
                const finding = findings.find((entry) => entry.filename === decision.filename);
                /* v8 ignore next 3 -- decisions are derived from the findings list above; a mismatch needs a flow bug */
                if (finding === undefined) {
                    continue;
                }
                outcomes.push(apply_triage(storeDir, repoRoot, finding, decision.action, discardCritical));
            }
        }
    }

    const level = passed || accepted ? ('clean' as const) : ('warning' as const);
    return project({
        result: {
            ok: true,
            value: {
                level,
                run: runRef,
                spec: digest.specId,
                gate: { passed, accepted, accepted_reason: accepted ? acceptReason : null },
                rows: gate.rows,
                gaps: gate.gaps.map((row) => ({ ac: row.ac, status: row.status })),
                lint: lint.value.artifacts,
                triage: outcomes,
            },
        },
        json,
        notes,
        render: (value) =>
            [
                digestText,
                ...(lintLines.length > 0 ? ['', 'artifact lint:', ...lintLines] : []),
                ...render_gate_lines(value.run, value.gate, value.gaps),
                ...(value.triage.length > 0
                    ? ['', 'triage:', ...value.triage.map((o) => `  ${o.finding}: ${o.action} — ${o.detail}`)]
                    : []),
            ].join('\n'),
    });
}

function render_gate_lines(
    run: string,
    gate: Readonly<{ passed: boolean; accepted: boolean }>,
    gaps: readonly Readonly<{ ac: string; status: string }>[]
): string[] {
    if (gate.passed) {
        return ['', `gate satisfied — run ${run} marked done`];
    }
    if (gate.accepted) {
        return ['', `gate accepted despite gaps (--accept-failing) — run ${run} marked done`];
    }
    return [
        '',
        `gate blocked — ${gaps.length} AC(s) lack cli-verified, exit-0, non-stale evidence:`,
        ...gaps.map((gap) => `  ${gap.ac}: ${gap.status}`),
        '  capture evidence with `suspec evidence add`, or accept explicitly with --accept-failing "<why>"',
    ];
}
