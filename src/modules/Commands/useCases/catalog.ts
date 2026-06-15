// The dispatchable command catalog (AC-004: advertised == dispatchable). One list, single-sourced:
// the dispatcher routes to each command's run(), `help` renders the `description`s, and per-command
// `<cmd> --help` renders the `usage` lines. The parity test cross-checks `name` against the
// useCases/ files. Exactly the M1 reconcile-only surface — no agent verbs, no garden.
export const COMMAND_CATALOG = [
    {
        name: 'init',
        description: 'Scaffold a Swarm workspace from the kit (conflict-safe)',
        usage: [
            'swarm init [dir]',
            '  --from <path|url>           kit source (default: the swarm-starter-kit on GitHub)',
            '  --workspace | --footprint   force the layout (else auto-detected by emptiness)',
            '  --on-conflict skip|overwrite|backup   handle an existing file (default: skip)',
            '  --force                     overwrite existing files (same as --on-conflict overwrite)',
            '  --json · -i                 machine output · interactive wizard',
        ],
    },
    {
        name: 'check',
        description: 'Lint a spec, or render the whole-workspace verdict',
        usage: [
            'swarm check [file]',
            '  (no file)                   aggregate every specs/*/spec.md into one workspace verdict',
            '  <file>                      lint one spec; exit 0 clean · 1 warnings · 2 error',
            '  --json · -i                 machine output · interactive flow',
        ],
    },
    {
        name: 'worktree',
        description: 'Create / list / remove / prune isolated task worktrees',
        usage: [
            'swarm worktree <create|list|remove|prune> [slug]',
            '  create <slug> [--task <t>] [--base <branch>]   worktree on swarm/<slug>[/<task>]',
            '  remove <slug> [--task <t>] [--force]           tear one down',
            '  list · prune                                   show / clear stale worktrees',
            '  --json · -i                                    machine output · interactive flow',
        ],
    },
    {
        name: 'status',
        description: 'The workspace board — specs, tasks, reviews, gaps',
        usage: ['swarm status', '  --json · -i                 machine output · interactive board'],
    },
    {
        name: 'review',
        description: 'Reconcile a finished run — diff vs self-report vs spec (no verdict)',
        usage: [
            'swarm review <task>',
            '  <task>                      reconcile the run for a task id/slug',
            '  --base <branch>             the worktree base to diff against (else the current branch)',
            '  --json · -i                 machine output · interactive flow',
            '  surfaces facts + routes; the human owns the Pass/Fail/Unverified/Blocked result',
        ],
    },
    {
        name: 'new',
        description: 'Cut a task packet from a spec, or scaffold a new spec',
        usage: [
            'swarm new <task|spec>',
            '  task --from <SPEC-id> [--scope AC-001,AC-002]   cut a task (scope never invented)',
            '  spec <slug>                                     scaffold a fresh draft spec',
            '  --json · -i                                     machine output · interactive flow',
        ],
    },
    {
        name: 'help',
        description: 'Show this command reference',
        usage: ['swarm help', 'swarm --help · swarm --version'],
    },
] as const;
