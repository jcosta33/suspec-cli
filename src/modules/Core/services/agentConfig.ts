// Parse the code repo's `.suspec/config.yaml` `agents:` block into adapter records, and resolve the
// adapter a launch should use. PURE (text in, records out) — the file read lives in the use-case.
//
// No YAML dependency: like the rest of suspec-cli (frontmatter is hand-scanned in taskLocator), this
// reads exactly the documented two-level `agents:` shape (future-cli.md "Agent adapters") — a top-level
// `agents:` mapping whose children are `default: <name>`, an `available:` list (informational, ignored
// here), and one mapping per adapter carrying `command` / `working_directory` / `startup_instruction`.
// It is not a general YAML parser; an exotic file is read as best-effort and a missing field surfaces
// at resolution (resolve_adapter), not by throwing.

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';
import { normalize_scalar } from '../../../infra/yamlScalar.ts';

// An adapter as read from config — fields optional until resolve_adapter validates the required ones.
export type RawAdapter = Readonly<{
    name: string;
    command?: string;
    working_directory?: string;
    startup_instruction?: string;
}>;

export type AgentConfig = Readonly<{
    default: string | null;
    adapters: ReadonlyMap<string, RawAdapter>;
}>;

// A fully-resolved adapter ready to launch — every required field present.
export type Adapter = Readonly<{
    name: string;
    command: string;
    // Informational: the documented adapter contract carries it (always `task_worktree`), but the
    // launcher always uses the git-resolved task worktree — it does not read this field. Kept so the
    // resolved record round-trips the documented shape.
    working_directory: string;
    startup_instruction: string;
}>;

// Leading-space count (indentation). Tabs are not expected in the documented shape.
function indent_of(line: string): number {
    return line.length - line.trimStart().length;
}

// Normalize a config value as YAML reads it — strip an inline `# …` comment and a surrounding quote
// pair (the shared frontmatter/config normalizer). `default: agent  # the primary one` → `agent`.
function scalar(raw: string): string {
    return normalize_scalar(raw);
}

// Parse the `agents:` block. Returns an empty config (default null, no adapters) when there is none —
// resolution then fails with a clear "no adapter" message rather than this throwing.
export function parse_agent_config(text: string): AgentConfig {
    const lines = text.split(/\r\n|[\r\n]/);
    const start = lines.findIndex((line) => /^agents:\s*$/.test(line));
    if (start === -1) {
        return { default: null, adapters: new Map() };
    }
    const blockIndent = indent_of(lines[start]);

    // The block is the run of lines indented deeper than `agents:`. Its direct children sit at the
    // first child's indent; an adapter's fields sit deeper still.
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.trim() === '') {
            body.push(line);
            continue;
        }
        if (indent_of(line) <= blockIndent) {
            break;
        }
        body.push(line);
    }
    const childIndent = (() => {
        for (const line of body) {
            if (line.trim() !== '') {
                return indent_of(line);
            }
        }
        return blockIndent + 2;
    })();

    let dflt: string | null = null;
    const adapters = new Map<string, RawAdapter>();
    let current: { name: string; command?: string; working_directory?: string; startup_instruction?: string } | null =
        null;

    const commit = (): void => {
        if (current !== null) {
            adapters.set(current.name, { ...current });
        }
    };

    for (const line of body) {
        if (line.trim() === '') {
            continue;
        }
        const at = indent_of(line);
        const keyMatch = /^\s*([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (keyMatch === null) {
            continue;
        }
        const [, key, rawValue] = keyMatch;
        if (at === childIndent) {
            // A direct child of `agents:` — `default`, `available`, or an adapter name.
            commit();
            current = null;
            if (key === 'default') {
                dflt = rawValue.trim().length > 0 ? scalar(rawValue) : null;
            } else if (key === 'available') {
                // informational list; not used for resolution
            } else if (rawValue.trim() === '') {
                current = { name: key };
            }
            // a `name: value` child that is not default/available is ignored (not an adapter mapping)
        } else if (at > childIndent && current !== null) {
            if (key === 'command') {
                current.command = scalar(rawValue);
            } else if (key === 'working_directory') {
                current.working_directory = scalar(rawValue);
            } else if (key === 'startup_instruction') {
                current.startup_instruction = scalar(rawValue);
            }
        }
    }
    commit();

    return { default: dflt, adapters };
}

// Resolve the adapter a launch should use: the explicit `--agent <name>`, else `agents.default`. A
// name with no record, no name and no default, or a record missing `command` is a usage error — the
// command turns it into exit 2, launching nothing.
export function resolve_adapter(config: AgentConfig, requested?: string): Result<Adapter, AppError> {
    const name = requested ?? config.default;
    if (name === null || name === undefined || name.length === 0) {
        return err(usage('no agent given and no `agents.default` in .suspec/config.yaml — pass --agent <name>'));
    }
    const raw = config.adapters.get(name);
    if (raw === undefined) {
        const known = [...config.adapters.keys()];
        const hint = known.length > 0 ? ` (configured: ${known.join(', ')})` : ' (no adapters configured)';
        return err(usage(`unknown agent "${name}" in .suspec/config.yaml${hint}`));
    }
    if (raw.command === undefined || raw.command.length === 0) {
        return err(usage(`agent "${name}" in .suspec/config.yaml has no \`command\``));
    }
    return ok({
        name,
        command: raw.command,
        working_directory: raw.working_directory ?? 'task_worktree',
        startup_instruction: raw.startup_instruction ?? '',
    });
}

// A local `Usage` error rather than Core/useCases/unixOutcome's `usage_error`: this is a pure Core
// service, and it stays free of any use-case dependency (the tag + message are identical, so the
// command's emit_error treats it exactly the same — exit 2).
function usage(message: string): AppError {
    return createAppError('Usage', message, {});
}
