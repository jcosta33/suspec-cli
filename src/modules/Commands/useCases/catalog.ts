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
        name: 'update',
        description: 'Check whether the workspace has drifted behind the latest kit (no write)',
        usage: [
            'swarm update [--check]',
            '  (the drift check)           compare .agents/.swarm-version to the kit VERSION',
            '  --from <path|url>           kit source (default: the swarm-starter-kit on GitHub)',
            '  --json                      machine output',
            '  exit 0 up-to-date · 1 behind · 2 error; reads only — the 3-way-merge apply is deferred (ADR-0091)',
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
            '  --repo <path>               the code repo holding the worktree (split-repo layout; else the workspace repo)',
            '  --write                     write a draft reviews/<slug>.md (status: draft, every row Unverified; no-clobber)',
            '  --force                     overwrite an existing draft (with --write)',
            '  --json · -i                 machine output · interactive flow',
            '  surfaces facts + routes; the human owns the Pass/Fail/Unverified/Blocked result',
        ],
    },
    {
        name: 'new',
        description: 'Cut a task packet from a spec, or scaffold a new spec / change plan',
        usage: [
            'swarm new <task|spec|change-plan>',
            '  task --from <SPEC-id> [--scope AC-001,AC-002] [--id <TASK-id>]   cut a task (scope never invented)',
            '  spec <slug>                                     scaffold a fresh draft spec',
            '  change-plan <slug>                              scaffold a draft change plan (migrations/rewrites)',
            '  --id <TASK-id>                                  name a 2nd+ task from one spec (else TASK-<spec-slug>)',
            '  --json · -i                                     machine output · interactive flow',
        ],
    },
    {
        name: 'pull',
        description: 'Snapshot a ticket into intake/ — verbatim, never a spec',
        usage: [
            'swarm pull <ref>',
            '  <ref>                       a gh issue (number/owner-repo#N/URL — fetched via gh), or any tracker ref',
            '  --force                     overwrite an existing intake/<slug>.md (else no-clobber)',
            '  --json                      machine output',
            '  writes one intake snapshot (paste placeholder when no fetch); never a spec, never the board',
        ],
    },
    {
        name: 'promote',
        description: 'Scaffold a candidate finding from a finished task (no learning asserted)',
        usage: [
            'swarm promote <task>',
            '  <task>                      the task/review id the finding is promoted from (pre-fills `from:`)',
            '  --force                     overwrite an existing findings/<slug>.md (else no-clobber)',
            '  --json                      machine output',
            '  scaffolds one finding (you fill what-we-learned); never the board, never a verdict',
        ],
    },
    {
        name: 'run',
        description: 'Launch a prepared task on an agent in its worktree — records the launch (no verdict)',
        usage: [
            'swarm run <task> --agent <name>',
            '  <task>                      the task to launch — its worktree must already exist (swarm worktree create)',
            '  --agent <name>              the adapter from .swarm/config.yaml (else agents.default)',
            '  --json                      machine output',
            '  launches the agent + records the launch envelope under .swarm/work/; never the board, never a verdict',
        ],
    },
    {
        name: 'show',
        description: 'Project a parsed artifact as JSON — task, spec, review, or the checks contract (read-only)',
        usage: [
            'swarm show <task|spec|review|checks> [ref]',
            '  task <stem>                 the parsed task packet (scope, affected areas, claimed changes)',
            '  spec <id|path>              the parsed spec (frontmatter, requirements + verify commands)',
            '  review <stem>               the parsed review packet (status, coverage rows, verify blocks)',
            '  checks                      the checks contract (version + the core checks)',
            '  --json                      machine output; reads only, renders no verdict',
        ],
    },
    {
        name: 'help',
        description: 'Show this command reference',
        usage: ['swarm help', 'swarm --help · swarm --version'],
    },
] as const;
