// Tui module barrel — the interactive surface the commands and the dispatcher consume cross-module
// (importing deep into Tui is forbidden by the dependency-cruiser no-deep-import rule; everything
// goes through here). Re-exports the per-flow entry points, the Prompter + its adapter, and the
// pure renderers (a service, surfaced here because the direct command path renders too).
export {
    format_check_report,
    format_workspace_report,
    format_board,
    format_worktrees,
    format_init_report,
    format_update_report,
    format_apply_report,
    format_review_report,
} from '../services/render.ts';
export { create_clack_prompter, is_cancelled, CANCEL, type Prompter } from './prompter.ts';
export { run_check_flow } from './checkFlow.ts';
export { run_worktree_flow } from './worktreeFlow.ts';
export { run_status_flow } from './statusFlow.ts';
export { run_review_flow } from './reviewFlow.ts';
export { run_new_flow } from './newFlow.ts';
export { run_init_flow } from './initFlow.ts';
export { run_dashboard_flow } from './dashboardFlow.ts';
