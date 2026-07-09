// The dashboard hub: `suspec` with no command opens this, routing to the daily store-loop flows.
// `init` is a one-time setup command, not a daily dashboard action, so it stays standalone. Pure
// orchestration over the injected Prompter + the per-flow modules.

import { type Prompter, is_cancelled } from './prompter.ts';
import { run_check_flow } from './checkFlow.ts';
import { run_status_flow } from './statusFlow.ts';
import { run_worktree_flow } from './worktreeFlow.ts';
import { run_new_flow } from './newFlow.ts';
import { run_review_flow } from './reviewFlow.ts';

export type DashboardFlowDeps = Readonly<{ cwd: string }>;

export async function run_dashboard_flow(prompter: Prompter, deps: DashboardFlowDeps): Promise<number> {
    prompter.intro('suspec');
    const choice = await prompter.select({
        message: 'What would you like to do?',
        options: [
            { value: 'status', label: 'Status', hint: 'the store summary — runs, specs, attention' },
            { value: 'check', label: 'Check', hint: "lint the store's artifacts" },
            { value: 'review', label: 'Review', hint: 'reconcile a store run against its spec' },
            { value: 'worktree', label: 'Worktree', hint: 'isolated task worktrees' },
            { value: 'new', label: 'New', hint: 'scaffold a store spec / cut a task slice' },
            { value: 'quit', label: 'Quit' },
        ],
    });
    if (is_cancelled(choice) || choice === 'quit') {
        prompter.outro('Bye.');
        return 0;
    }
    if (choice === 'check') {
        return run_check_flow(prompter, { cwd: deps.cwd });
    }
    if (choice === 'review') {
        return run_review_flow(prompter, { cwd: deps.cwd });
    }
    if (choice === 'status') {
        return run_status_flow(prompter, { cwd: deps.cwd });
    }
    if (choice === 'worktree') {
        return run_worktree_flow(prompter, { cwd: deps.cwd });
    }
    return run_new_flow(prompter, { cwd: deps.cwd });
}
