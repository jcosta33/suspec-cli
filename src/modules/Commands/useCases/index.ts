// Commands module barrel.
//
// Commands is the orchestration leaf — its useCases are dispatched by file path
// from src/index.ts (see execute_command), not consumed by other modules. The
// only thing the entry point needs from this module is the catalog of command
// names + descriptions used for fuzzy-match suggestions and registry seeding.
//
// Surface note (ADR-0001 / spec 005): the command garden has been collapsed toward the canonical surface
// (swarm-cli IF-001). Listed below are the commands that exist today: the 7 built canonical commands
// (init, format, decompose, task, review, merge, status) plus the task-navigation set (new/open/list/show/
// pick/focus) pending its fold into `task` (spec 005 AC-004), `dashboard` (the no-args TUI), `help`, and
// `doctor`. `launch-agent` is intentionally uncataloged — it is a dependency of `new`/`open`, not a
// user-facing command. The 7 unbuilt canonical commands (lint/check/lower/worktree/trace/promote/drift)
// are not yet listed because they are not yet built.
export const COMMAND_CATALOG = [
    // Canonical (built)
    { name: 'init', description: 'Setup Swarm in the current repository' },
    { name: 'lint', description: 'Lint a *.swarm.md spec (SOL diagnostics)' },
    { name: 'format', description: 'Run Prettier on a single file' },
    { name: 'decompose', description: 'Decompose a task graph into a DAG' },
    { name: 'task', description: 'Append human feedback to a task file' },
    { name: 'review', description: 'Spawn an adversarial peer-review agent' },
    { name: 'merge', description: 'Merge a branch with conflict detection' },
    { name: 'status', description: 'Runtime status: state, telemetry, dirtiness' },
    // Task navigation — pending fold into `task` (spec 005 AC-004)
    { name: 'new', description: 'Create a new isolated sandbox task' },
    { name: 'open', description: 'Reopen an existing sandbox' },
    { name: 'list', description: 'List active sandboxes' },
    { name: 'show', description: 'Show detailed metadata for a sandbox' },
    { name: 'pick', description: 'Fuzzy-finder over sandboxes' },
    { name: 'focus', description: 'Open a sandbox in your editor' },
    // Shell / adoption
    { name: 'dashboard', description: 'Launch interactive TUI dashboard' },
    { name: 'help', description: 'Show command reference' },
    { name: 'doctor', description: 'Deep environment diagnostics' },
] as const;
