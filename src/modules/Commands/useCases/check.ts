#!/usr/bin/env node

// `swarm check [file]` — the check engine's command surface (AC-005/006/008).
//   swarm check <spec-file>   lint one spec
//   swarm check               render the whole-workspace verdict (D-001)
//   swarm check -i            the interactive flow (AC-015), TTY + not --json only
// Direct output + exit codes flow through the shared unixOutcome contract (AC-001).

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { check_spec, check_workspace, project, usage_error } from '../../Core/useCases/index.ts';
import { err } from '../../../infra/errors/result.ts';
import {
    format_check_report,
    format_workspace_report,
    run_check_flow,
    create_clack_prompter,
} from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const json = argv.includes('--json');
    const interactive = argv.includes('-i') || argv.includes('--interactive');
    const noWorkspace = argv.includes('--no-workspace');
    const positional = argv.filter((arg) => !arg.startsWith('-'));

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
                result: err(usage_error(`not a spec file (it is a directory): ${file} — point at the spec.md inside it`)),
                json,
                render: format_check_report,
            });
        }
        const exists = (ref: string) => existsSync(resolve(dirname(file), ref));
        return project({
            result: check_spec({ source: readFileSync(file, 'utf8'), path: file, exists }),
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

/* v8 ignore start -- the script entry runs when spawned by the dispatcher, not as a unit */
if (import.meta.url === `file://${process.argv[1]}`) {
    void run(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
/* v8 ignore stop */
