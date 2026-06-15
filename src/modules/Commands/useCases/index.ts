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
export { print_help, print_command_help } from './help.ts';
