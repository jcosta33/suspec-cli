#!/usr/bin/env node

// `suspec check [file...]` — the check engine's command surface.
//   suspec check <file>...     lint one or more specs/reviews/change-plans in one process (exit = max)
//   suspec check               lint the STORE's artifacts for this repo (ADR-0137 — no workspace tree)
//   suspec check -i            the interactive flow, TTY + not --json only
// Direct output + exit codes flow through the shared unixOutcome contract.

import { existsSync, readFileSync, statSync } from 'node:fs';

import {
    check_spec,
    check_review_file,
    check_change_plan,
    build_spec_ref_resolver,
    build_anchor_resolver,
    build_source_exists,
    infer_workspace_root,
    find_workspace_spec_files,
    find_sibling_spec_files,
    scan_spec_staleness,
    lint_store_artifacts,
    resolve_store_dir,
    project,
    usage_error,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root } from '../../Workspace/useCases/index.ts';
import { ok, err, isErr } from '../../../infra/errors/result.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import {
    format_check_report,
    format_store_lint,
    run_check_flow,
    create_clack_prompter,
} from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--staleness'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const staleness = flags.get('staleness') === true;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter (checkFlow.spec) */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_check_flow(create_clack_prompter(), { cwd });
    }
    /* v8 ignore stop */

    // `--staleness` (ADR-0108 item 4): the git-backed spec-staleness advisory — diff each snapshotted
    // spec's Affected areas against its recorded `snapshot:` SHA. Opt-in so the default `suspec check`
    // stays filesystem-only (no git needed in CI). Never blocks: with no git repo it reports a skip and
    // exits 0 (advisory), and a spec with no snapshot is simply not compared.
    if (staleness) {
        const rootResult = resolve_repo_root(cwd);
        if (isErr(rootResult)) {
            return project({
                result: ok({ level: 'clean' as const, stale: [], scanned: 0, skipped: 'no-git-repository' as const }),
                json,
                render: () => 'spec-staleness — skipped: no git repository found (staleness detection needs one)',
            });
        }
        return project({
            result: scan_spec_staleness({ workspaceDir: cwd, repoRoot: rootResult.value }),
            json,
            render: (report) => {
                const lines = [
                    `spec-staleness — ${String(report.stale.length)} possibly stale, ${String(report.scanned)} snapshotted spec(s) scanned`,
                ];
                for (const spec of report.stale) {
                    lines.push(
                        `  ${spec.id ?? spec.path} — areas changed since ${spec.snapshot.slice(0, 8)}: ${spec.changedAreas.join(', ')}`
                    );
                }
                if (report.stale.length === 0) {
                    lines.push(
                        report.scanned === 0
                            ? '  no spec records a `snapshot:` SHA yet — add one to a ready/active spec to enable staleness detection.'
                            : '  all snapshotted specs are current.'
                    );
                }
                return lines.join('\n');
            },
        });
    }

    // Check one named file: dispatch by artifact type (review / change-plan / spec) and render its
    // report. Returns the file's exit code (the shared unixOutcome contract via `project`).
    const check_one_file = (file: string): number => {
        if (!existsSync(file)) {
            return project({ result: err(usage_error(`file not found: ${file}`)), json, render: format_check_report });
        }
        if (statSync(file).isDirectory()) {
            return project({
                result: err(
                    usage_error(`not a spec file (it is a directory): ${file} — point at the spec.md inside it`)
                ),
                json,
                render: format_check_report,
            });
        }
        const source = readFileSync(file, 'utf8');
        const head = source
            .split(/\r\n|[\r\n]/)
            .slice(0, 12)
            .join('\n');
        // A review packet (`type: review`) runs the C012 coverage + C013 verify-evidence-binding
        // reconcile (AC-028 / AC-005); a spec runs the core spec checks. The review path resolves the
        // task + source spec from the cwd workspace.
        if (/^type:\s*review\s*$/m.test(head)) {
            return project({
                result: check_review_file({ workspaceDir: cwd, reviewPath: file }),
                json,
                render: format_check_report,
            });
        }
        // A change plan (`type: change-plan`) runs C010/C011 (W6). C010 resolves `SPEC-x#AC-NNN` refs
        // against the candidate specs — the cwd workspace's specs/ tree plus the plan's sibling specs
        // (the fixture layout). A `type: spec` file falls through to the spec checks, unaffected.
        if (/^type:\s*change-plan\s*$/m.test(head)) {
            const specFiles = [...find_workspace_spec_files(cwd), ...find_sibling_spec_files(file)];
            return project({
                result: check_change_plan({
                    source,
                    path: file,
                    spec_ref_resolves: build_spec_ref_resolver(specFiles),
                }),
                json,
                render: format_check_report,
            });
        }
        // An artifact whose `type:` has NO single-file check face (task, finding, adr, intake,
        // inventory, run, evidence, …) must not fall through to the SPEC checks — that only emits
        // category-error warnings ("no Requirements section" against a finding). Say so cleanly and
        // exit 0: nothing to validate is not a defect. A `type: spec` file and a type-less file
        // (the legacy shape the spec parser owns rejecting) still take the spec path below.
        const typeMatch = /^type:\s*(.+?)\s*$/m.exec(head);
        const artifactType = typeMatch !== null ? typeMatch[1] : null;
        if (artifactType !== null && artifactType !== 'spec') {
            return project({
                result: ok({ level: 'clean' as const, path: file, type: artifactType, checked: false }),
                json,
                render: () =>
                    `${file} — no checks for type ${artifactType} (single-file check faces: spec, review, change-plan); nothing to validate`,
            });
        }
        // C009 resolves a source ref relative to the spec dir OR the workspace root (so a root-level
        // `intake/x.md` sourced from `specs/<feature>/spec.md` resolves, not only a co-located ref).
        const exists = build_source_exists(file, infer_workspace_root(file, cwd));
        // The C015 resolver: built from the spec's named sources.md (read here, so the engine stays
        // pure); admits every key when no sources.md is resolvable — the ADR-0087 no-false-flag rule.
        const anchor_resolves = build_anchor_resolver(source, file);
        return project({
            result: check_spec({ source, path: file, exists, anchor_resolves }),
            json,
            render: format_check_report,
        });
    };

    // #93: check EVERY named file in ONE process — the pre-commit hook batches the staged set here so
    // the ~0.15s startup floor is paid once, not per file (measured 80s → flat 0.15s at 500 files). The
    // exit code is the max across files (the shared unixOutcome ordering: 0 clean < 1 warning < 2 block).
    if (positional.length > 0) {
        let status = 0;
        for (const file of positional) {
            const code = check_one_file(file);
            if (code > status) {
                status = code;
            }
        }
        return status;
    }

    // No file named: lint the STORE's artifacts for this repo (ADR-0137). The store is PROBED,
    // never created — a repo with no store yet is clean (nothing to lint is not a defect).
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;
    const store = resolve_store_dir({ repoRoot, probe: true });
    if (isErr(store)) {
        return project({
            result: ok({ level: 'clean' as const, runCount: 0, specCount: 0, artifacts: [] }),
            json,
            render: () => 'no store for this repo yet — nothing to lint (`suspec write spec "<intent>"` starts one)',
        });
    }
    return project({
        result: lint_store_artifacts({ storeDir: store.value.storeDir, repoRoot }),
        json,
        render: format_store_lint,
    });
}
