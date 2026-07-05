// Setup commands (SPEC-suspec-cli-work AC-003): the optional `setup` block in the consumer-side
// `suspec.config.json` — a list of command strings `suspec work` runs in the fresh worktree before it
// launches the agent. A pure parser beside runtimeIsolation.ts (use-cases depend on services, never the
// reverse); the disk read lives in the read_setup_commands use-case. Any shape that is not a list of
// non-empty strings parses to an empty list — setup is then a no-op (advisory, never a gate).

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function parse_setup_config(raw: unknown): readonly string[] {
    if (!is_record(raw)) {
        return [];
    }
    const setup = raw.setup;
    if (!Array.isArray(setup)) {
        return [];
    }
    return setup.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
