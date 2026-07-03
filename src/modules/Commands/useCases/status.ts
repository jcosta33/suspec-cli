#!/usr/bin/env node

// `suspec status` — the reconcile engine's command surface (AC-011): a read-only derived board over
// the workspace artifacts (specs ← tasks ← reviews), the review-ready-without-review list, and the
// needs-human list. Writes nothing. `-i` opens the framed interactive board.

import { project, derive_board } from '../../Core/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_board, run_status_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

// Synchronous: `status` only reads + renders (no prompts to await). The dispatcher awaits commands
// uniformly, so a plain exit code is fine here.
// #92: at volume the flat board is a wall to scan. `--needs-review` narrows the human-readable board
// to the specs with an actionable task — one awaiting review or needing a human. The summary lines
// (Awaiting review / Needs human) always render in full, and `--json` stays the raw, unfiltered
// escape hatch (a client slices it itself).
type Board = Parameters<typeof format_board>[0];
function actionable_only(board: Board): Board {
    const flagged = new Set([...board.tasksWithoutReview, ...board.needsHuman]);
    return { ...board, specs: board.specs.filter((spec) => spec.tasks.some((task) => flagged.has(task.id))) };
}

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--needs-review'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const needsReviewOnly = flags.get('needs-review') === true;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_status_flow(create_clack_prompter(), { workspaceDir: cwd });
    }
    /* v8 ignore stop */

    return project({
        result: derive_board({ workspaceDir: cwd }),
        json,
        render: (board) => format_board(needsReviewOnly ? actionable_only(board) : board),
    });
}
