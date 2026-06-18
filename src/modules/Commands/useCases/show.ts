#!/usr/bin/env node

// `swarm show <task|spec|review|checks> [ref]` — a read-only projection of a parsed Swarm artifact, the
// loader surface swarm-mcp (ADR-0085) adapts over the `--json` contract. Thin: parse flags, call the
// reconcile-only `show_artifact` engine, project. Renders no verdict and writes nothing.
//   swarm show task <stem>        the parsed task packet (scope, affected areas, claimed changes)
//   swarm show spec <id|path>     the parsed spec (frontmatter, requirements + verify commands)
//   swarm show review <stem>      the parsed review packet (status, coverage rows, verify blocks)
//   swarm show checks             the checks contract (version + the core checks)
//   --json                        machine output

import { project, show_artifact } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, { booleans: ['--json'], strings: [] });
    const json = flags.get('json') === true;
    const kind = positional[0] ?? '';
    const ref = positional[1];

    return project({
        result: show_artifact({ workspaceDir: cwd, kind, ref }),
        json,
        render: (result) => JSON.stringify(result.value, null, 2),
    });
}
