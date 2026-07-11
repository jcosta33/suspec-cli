// Commands module barrel — the module's external surface. The dispatcher (src/index.ts) composes
// the command surface through THIS barrel, not deep imports: the check command's run(), the usage
// renderer, and the dispatchable catalog (test-pinned to the dispatcher).
export { COMMAND_CATALOG } from './catalog.ts';
export { run as run_check } from './check.ts';
export { print_usage } from './usage.ts';
