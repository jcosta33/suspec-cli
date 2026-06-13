#!/usr/bin/env node

// `swarm status` — the reconcile engine's command surface (AC-011): a read-only derived board over
// the workspace artifacts (specs ← tasks ← reviews), the review-ready-without-review list, and the
// needs-human list. Writes nothing. `-i` opens the framed interactive board.

import { project, derive_board } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_board, run_status_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { flags } = parse_flags(argv, { booleans: ['--json', '-i', '--interactive'], strings: [] });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_status_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    return project({ result: derive_board({ workspaceDir: cwd }), json, render: (board) => format_board(board) });
}

/* v8 ignore start -- the script entry runs when spawned by the dispatcher, not as a unit */
if (import.meta.url === `file://${process.argv[1]}`) {
    void run(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
/* v8 ignore stop */
