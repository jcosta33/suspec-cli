#!/usr/bin/env node

// `swarm new <type> …` — the prepare engine's command surface (AC-013, D-004):
//   swarm new task --from <SPEC-id> [--scope AC-001,AC-002]   cut a task packet (scope copied, never invented)
//   swarm new spec <slug> [--title <t>] [--owner <o>]          scaffold a fresh draft spec
//   swarm new                                                  the interactive flow (TTY)

import { project, emit_error, usage_error, cut_packet, scaffold_spec } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { run_new_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive'],
        strings: ['--from', '--scope', '--title', '--owner'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const type = positional[0];

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || type === undefined) && process.stdout.isTTY === true && !json) {
        return run_new_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    if (type === 'task') {
        const fromFlag = flags.get('from');
        if (typeof fromFlag !== 'string') {
            return emit_error(usage_error('usage: swarm new task --from <SPEC-id> [--scope AC-001,AC-002]'), json);
        }
        const scopeFlag = flags.get('scope');
        const scope =
            typeof scopeFlag === 'string'
                ? scopeFlag
                      .split(',')
                      .map((id) => id.trim())
                      .filter((id) => id.length > 0)
                : [];
        return project({
            result: cut_packet({ workspaceDir: cwd, specId: fromFlag, scope }),
            json,
            render: (report) => `cut ${report.taskId} (${String(report.scope.length)} scoped)\n  ${report.path}`,
        });
    }

    if (type === 'spec') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: swarm new spec <slug> [--title <t>] [--owner <o>]'), json);
        }
        const titleFlag = flags.get('title');
        const ownerFlag = flags.get('owner');
        return project({
            result: scaffold_spec({
                workspaceDir: cwd,
                slug,
                title: typeof titleFlag === 'string' ? titleFlag : undefined,
                owner: typeof ownerFlag === 'string' ? ownerFlag : undefined,
            }),
            json,
            render: (report) => `scaffolded ${report.specId}\n  ${report.path}`,
        });
    }

    if (type === undefined) {
        return emit_error(
            usage_error('usage: swarm new <task|spec> — `new task --from <SPEC-id> [--scope …]` or `new spec <slug>`'),
            json
        );
    }
    return emit_error(usage_error(`unknown new type: ${type} — use task | spec`), json);
}

/* v8 ignore start -- the script entry runs when spawned by the dispatcher, not as a unit */
if (import.meta.url === `file://${process.argv[1]}`) {
    void run(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
/* v8 ignore stop */
