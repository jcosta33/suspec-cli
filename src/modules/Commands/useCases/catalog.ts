// The dispatchable command catalog — one list, single-sourced: the dispatcher routes to each
// command's run(), and the usage renderer (usage.ts) renders the `usage` lines. The surface is the
// single check verb (ADR-0143): the CLI reads exactly the files it is handed — the primary
// artifact's kind comes from its own frontmatter, companions are explicit flags.
export const COMMAND_CATALOG = [
    {
        name: 'check',
        description: 'Validate Suspec artifacts by their frontmatter type — spec, change-plan, or review',
        usage: [
            'suspec check <artifact> [<artifact>...]',
            '  <artifact>                a spec or change-plan file (type read from its own frontmatter);',
            '                            several files run in one process — exit = the max across files',
            'suspec check <review-path> --spec <spec-path> [--task <task-path>]',
            '  <review-path>             a review packet; --spec is always required',
            '  --spec <path>             the source spec the review reconciles against',
            '  --task <path>             the task packet whose scope keys the coverage check —',
            '                            required iff the review names a `task:`',
            'suspec check --contract',
            '  --contract                print the checks contract (version + core checks) as JSON',
            '',
            '  --json                    machine-readable output',
            '  exit codes: 0 clean · 1 warnings · 2 blocking / error',
        ],
    },
] as const;
