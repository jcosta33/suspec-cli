#!/usr/bin/env node

// `swarm check [file]` — the check engine's command surface (AC-005/006/008).
//   swarm check <spec-file>   lint one spec
//   swarm check               render the whole-workspace verdict (D-001)
//   swarm check -i            the interactive flow (AC-015), TTY + not --json only
// Direct output + exit codes flow through the shared unixOutcome contract (AC-001).

import { existsSync, readFileSync, statSync } from 'node:fs';

import {
    check_spec,
    check_workspace,
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
import { err } from '../../../infra/errors/result.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import {
    format_check_report,
    format_workspace_report,
    run_check_flow,
    create_clack_prompter,
} from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--no-workspace'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const noWorkspace = flags.get('no-workspace') === true;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter (checkFlow.spec) */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_check_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    if (positional.length > 0) {
        const file = positional[0];
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
        const head = source.split(/\r\n|[\r\n]/).slice(0, 12).join('\n');
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
                result: check_change_plan({ source, path: file, spec_ref_resolves: build_spec_ref_resolver(specFiles) }),
                json,
                render: format_check_report,
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
    }

    return project({
        result: check_workspace({ workspaceDir: cwd, includeValidity: !noWorkspace }),
        json,
        render: format_workspace_report,
    });
}
