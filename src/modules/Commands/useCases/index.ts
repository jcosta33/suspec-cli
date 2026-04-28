export * from '../services/registry.ts';

import { register_capability } from '../services/registry.ts';
import { adapter_capabilities } from '../../Adapters/useCases/index.ts';

for (const cap of adapter_capabilities) {
    register_capability(cap);
}

// Commands are dispatched by file path (see src/index.ts), so the registry just
// publishes their names/descriptions for `swarm capabilities` and the dashboard.
// Do NOT `export *` from useCase files here — every useCase exports a `run`
// function and the resulting collisions break typecheck.
const COMMAND_CATALOG = [
    { name: 'new', description: 'Create a new isolated sandbox task' },
    { name: 'open', description: 'Reopen an existing sandbox' },
    { name: 'list', description: 'List active sandboxes' },
    { name: 'show', description: 'Show detailed metadata for a sandbox' },
    { name: 'status', description: 'Runtime status: state, telemetry, dirtiness' },
    { name: 'remove', description: 'Forcefully remove a sandbox' },
    { name: 'prune', description: 'Clean up merged or orphaned sandboxes' },
    { name: 'validate', description: 'Run configured linters and typechecks' },
    { name: 'test', description: 'Run the test runner' },
    { name: 'test-radius', description: 'Run only the specs impacted by a file' },
    { name: 'init', description: 'Setup Swarm in the current repository' },
    { name: 'lock', description: 'Advisory file locking for parallel agents' },
    { name: 'merge', description: 'Merge a branch with conflict detection' },
    { name: 'capabilities', description: 'List registered capabilities' },
    { name: 'help', description: 'Show command reference' },
    { name: 'dashboard', description: 'Launch interactive TUI dashboard' },
    { name: 'decompose', description: 'Decompose a task graph into a DAG' },
    { name: 'logs', description: 'Query the telemetry database' },
    { name: 'arch', description: 'Lint cross-module boundary invariants' },
    { name: 'audit-sec', description: 'Scan for dangerous patterns and secrets' },
    { name: 'ast-rename', description: 'Structural rename of a symbol' },
    { name: 'chaos', description: 'Toggle latency/failure injection' },
    { name: 'chat', description: 'Append-only IPC log between agents' },
    { name: 'complexity', description: 'Cyclomatic complexity heuristic' },
    { name: 'compress', description: 'Skeletonize a TS file' },
    { name: 'context', description: 'Generate semantic export map for RAG' },
    { name: 'daemon', description: 'Background watcher running test-radius on save' },
    { name: 'dead-code', description: 'Find exported symbols never imported' },
    { name: 'deps', description: 'Find outdated packages and queue upgrade tasks' },
    { name: 'docs', description: 'Extract JSDoc blocks' },
    { name: 'doctor', description: 'Deep environment diagnostics' },
    { name: 'epic', description: 'Decompose a markdown checklist into child tasks' },
    { name: 'find', description: 'Semantic-ish symbol search' },
    { name: 'focus', description: 'Open a sandbox in your editor' },
    { name: 'format', description: 'Run Prettier on a single file' },
    { name: 'fuzz', description: 'Generate fuzz tests for a function' },
    { name: 'graph', description: 'Map import/export dependency graph' },
    { name: 'heal', description: 'Self-healing hotfix when typecheck fails' },
    { name: 'health', description: 'Quick pre-flight environment check' },
    { name: 'knowledge', description: 'Search past tasks, audits, specs, PRs' },
    { name: 'memory', description: 'Cross-agent markdown memory bank' },
    { name: 'message', description: 'Queue a structured message into a mailbox' },
    { name: 'migrate', description: 'Translator + Verifier agent pair' },
    { name: 'mock', description: 'Generate a TS mock factory for an interface' },
    { name: 'path', description: 'Print absolute path of a sandbox' },
    { name: 'pick', description: 'Fuzzy-finder over sandboxes' },
    { name: 'pr', description: 'Auto-commit and optionally open a PR' },
    { name: 'profile', description: 'Profile a Node process and assign optimizer' },
    { name: 'refactor', description: 'Break a refactor into chunks' },
    { name: 'references', description: 'Fast git-grep symbol usages' },
    { name: 'release', description: 'Bump semver and draft release notes' },
    { name: 'repro', description: 'Verify TDD: tests modified before source' },
    { name: 'review', description: 'Spawn an adversarial peer-review agent' },
    { name: 'screenshot', description: 'Capture a Playwright screenshot' },
    { name: 'task', description: 'Append human feedback to a task file' },
    { name: 'telemetry', description: 'Aggregated session metrics dashboard' },
    { name: 'triage', description: 'Convert a raw bug report into a spec' },
    { name: 'visual', description: 'Screenshot-based visual regression' },
] as const;

for (const cmd of COMMAND_CATALOG) {
    register_capability({
        name: cmd.name,
        version: '1.0.0',
        type: 'command',
        description: cmd.description,
        entry_point: `./useCases/${cmd.name}.ts`,
    });
}