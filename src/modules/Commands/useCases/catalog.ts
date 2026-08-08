// The dispatchable command catalog — the usage renderer (usage.ts) renders the `usage` lines,
// and the dispatcher's COMMANDS map is cross-checked against this list by test (index.spec.ts). The surface is the
// check and isolated user setup (ADR-0172): primary artifacts and companions are explicit. Lookups beyond them
// are artifact-relative reference resolution (C009/C015/C026) and C010's bounded sibling-spec scan
// — never an inferred root or general tree walk.
export const COMMAND_CATALOG = [
    {
        name: 'check',
        description: 'Validate Suspec artifacts by explicit frontmatter type',
        usage: [
            'suspec check <artifact> [<artifact>...]',
            '  <artifact>                a spec or change-plan file (type read from frontmatter);',
            '                            several files run in one process — exit = the max across files',
            'suspec check <task-path> [<task-path>...] --spec <spec-path>',
            '  <task-path>               task packet bound to the explicit ready source spec',
            'suspec check <review-path> --spec <spec-path> [--task <task-path>]',
            '  <review-path>             a review packet; --spec is always required',
            '  --spec <path>             source spec for task binding or review reconciliation',
            '  --task <path>             the task packet whose scope keys the coverage check —',
            '                            required iff the review names a `task:`',
            'suspec check --contract',
            '  --contract                print the checks contract (version + core checks) as JSON',
            '',
            '  --json                    one JSON value per report; multiple reports use JSON Lines',
            '  exit codes: 0 clean · 1 warnings · 2 blocking / error',
        ],
    },
    {
        name: 'setup',
        description: 'Install, inspect, or remove the user-level economy policy',
        usage: [
            'suspec setup <codex|claude-code|opencode>... [--dry-run] [--yes]',
            'suspec setup <codex|claude-code|opencode>... --check',
            'suspec setup <codex|claude-code|opencode>... --remove [--yes]',
            '  --dry-run                preview installation without writing',
            '  --check                  inspect installation without writing',
            '  --remove                 preview removal; --yes applies it',
            '  --yes                    apply an approved install or removal',
            '  --json                   emit one versioned setup envelope',
            '  exit codes: 0 current / changed · 1 preview / drift / unknown · 2 blocked / invalid',
        ],
    },
] as const;
