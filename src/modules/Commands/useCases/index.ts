// Commands module barrel — the module's external surface. The dispatcher (src/index.ts) composes the
// command surface through THIS barrel, not deep imports: each command's run(), the help renderers, and
// the single-sourced dispatchable catalog.
export { COMMAND_CATALOG } from './catalog.ts';
export { run as run_check } from './check.ts';
export { run as run_worktree } from './worktree.ts';
export { run as run_status } from './status.ts';
export { run as run_review } from './review.ts';
export { run as run_new } from './new.ts';
export { run as run_init } from './init.ts';
export { run as run_update } from './update.ts';
export { run as run_pull } from './pull.ts';
export { run as run_promote } from './promote.ts';
export { run as run_run } from './run.ts';
export { run as run_show } from './show.ts';
export { run as run_agents } from './agents.ts';
export { print_help, print_command_help } from './help.ts';
