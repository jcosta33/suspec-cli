#!/usr/bin/env node

// `suspec check <file>...` — the check engine's command surface.
//   suspec check <file>...     lint one or more specs/reviews/change-plans in one process (exit = max)
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
    project,
    usage_error,
} from '../../Core/useCases/index.ts';
import { err, ok } from '../../../infra/errors/result.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_check_report } from '../services/renderCheckReport.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json'],
        strings: [],
    });
    const json = flags.get('json') === true;

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
        // reconcile; a spec runs the core spec checks.
        if (/^type:\s*review\s*$/m.test(head)) {
            return project({
                result: check_review_file({ workspaceDir: cwd, reviewPath: file }),
                json,
                render: format_check_report,
            });
        }
        // A change plan (`type: change-plan`) runs C010/C011. C010 resolves `SPEC-x#AC-NNN` refs
        // against the candidate specs. A `type: spec` file falls through to the spec checks.
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
        // inventory, …) must not fall through to the SPEC checks — that only emits category-error
        // warnings ("no Requirements section" against a finding). Say so cleanly and exit 0: nothing
        // to validate is not a defect. A `type: spec` file and a type-less file (the legacy shape the
        // spec parser owns rejecting) still take the spec path below.
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

    if (positional.length === 0) {
        return project({
            result: err(usage_error('no artifact named — usage: suspec check <artifact> [<artifact>...]')),
            json,
            render: format_check_report,
        });
    }

    // Check EVERY named file in ONE process — a caller batching a staged set pays the ~0.15s startup
    // floor once, not per file. The exit code is the max across files (the shared unixOutcome
    // ordering: 0 clean < 1 warning < 2 blocking).
    let status = 0;
    for (const file of positional) {
        const code = check_one_file(file);
        if (code > status) {
            status = code;
        }
    }
    return status;
}
