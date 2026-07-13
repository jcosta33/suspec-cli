// The dispatchable command catalog — the usage renderer (usage.ts) renders the `usage` lines,
// and the dispatcher's COMMANDS map is cross-checked against this list by test (index.spec.ts). The surface is the
// single check verb (ADR-0143): the CLI reads exactly the files it is handed — the primary
// artifact's kind comes from its own frontmatter, companions are explicit flags. The only lookups
// beyond the handed files are artifact-relative reference resolution (C009/C015 from the artifact
// directory, C010's bounded sibling-spec scan) — never a tree walk, never an inferred root.
export const COMMAND_CATALOG = [
    {
        name: 'check',
        description: 'Validate Suspec artifacts by explicit frontmatter type',
        usage: [
            'suspec check <artifact> [<artifact>...]',
            '  <artifact>                a spec, task, or change-plan file (type read from frontmatter);',
            '                            several files run in one process — exit = the max across files',
            'suspec check <review-path> --spec <spec-path> [--task <task-path>]',
            '  <review-path>             a review packet; --spec is always required',
            '  --spec <path>             the source spec the review reconciles against',
            '  --task <path>             the task packet whose scope keys the coverage check —',
            '                            required iff the review names a `task:`',
            'suspec check --contract',
            '  --contract                print the checks contract (version + core checks) as JSON',
            '',
            '  --json                    one JSON value per report; multiple reports use JSON Lines',
            '  exit codes: 0 clean · 1 warnings · 2 blocking / error',
        ],
    },
] as const;
