// The interactive `status` flow (AC-015): a framed, coloured view of the derived board. Status is
// a read-only view, so the interactive form is the rich presentation (no prompts) — the dashboard
// can route here. Pure over the injected Prompter + the reconcile engine.

import { derive_board } from '../../Core/useCases/index.ts';
import { isOk } from '../../../infra/errors/result.ts';
import { type Prompter } from './prompter.ts';
import { format_board } from '../services/render.ts';

export type StatusFlowDeps = Readonly<{ workspaceDir: string }>;

export function run_status_flow(prompter: Prompter, deps: StatusFlowDeps): number {
    prompter.intro('suspec status');
    const result = derive_board({ workspaceDir: deps.workspaceDir });
    /* v8 ignore start -- derive_board does not err; it returns a Result for contract uniformity */
    if (!isOk(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗');
        return 2;
    }
    /* v8 ignore stop */
    const board = result.value;
    prompter.note(format_board(board), 'Board');
    const flagged = board.tasksWithoutReview.length + board.needsHuman.length;
    prompter.outro(flagged > 0 ? `${flagged} item(s) need attention` : 'all clear');
    return 0;
}
