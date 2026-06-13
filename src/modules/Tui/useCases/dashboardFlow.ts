// The dashboard hub (AC-015): `swarm` with no command opens this, routing to the daily reconcile-
// loop flows. `init` is a one-time setup command, not a daily dashboard action, so it stays
// standalone. Pure orchestration over the injected Prompter + the per-flow modules.

import { type Prompter, is_cancelled } from './prompter.ts';
import { run_check_flow } from './checkFlow.ts';
import { run_status_flow } from './statusFlow.ts';
import { run_worktree_flow } from './worktreeFlow.ts';
import { run_new_flow } from './newFlow.ts';

export type DashboardFlowDeps = Readonly<{ cwd: string }>;

export async function run_dashboard_flow(prompter: Prompter, deps: DashboardFlowDeps): Promise<number> {
    prompter.intro('swarm');
    const choice = await prompter.select({
        message: 'What would you like to do?',
        options: [
            { value: 'status', label: 'Status', hint: 'the workspace board' },
            { value: 'check', label: 'Check', hint: 'lint specs against the contract' },
            { value: 'worktree', label: 'Worktree', hint: 'isolated task worktrees' },
            { value: 'new', label: 'New', hint: 'cut a task / scaffold a spec' },
            { value: 'quit', label: 'Quit' },
        ],
    });
    if (is_cancelled(choice) || choice === 'quit') {
        prompter.outro('Bye.');
        return 0;
    }
    if (choice === 'check') {
        return run_check_flow(prompter, { workspaceDir: deps.cwd });
    }
    if (choice === 'status') {
        return run_status_flow(prompter, { workspaceDir: deps.cwd });
    }
    if (choice === 'worktree') {
        return run_worktree_flow(prompter, { cwd: deps.cwd });
    }
    return run_new_flow(prompter, { workspaceDir: deps.cwd });
}
