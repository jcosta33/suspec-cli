// Runner adapters (SPEC-suspec-v2 AC-009): resolve the runner `suspec work` launches from the
// consumer-side `suspec.config.json` `runners` map — `runners.default` names the default; every
// other key is a runner record carrying a `command_template` with `{prompt}` / `{cwd}` / `{store}`
// placeholders. Claude Code and Codex ship as BUILT-INS used when the config does not override
// them; the Codex template puts the repo's store dir into the sandbox's writable_roots — the
// sandbox is the adapter's problem, never architecture (ADR-0137 D2). PURE (parsed JSON in,
// records out); the file read lives in resolve_launch_from_store. This map replaces the retired
// `.suspec/config.yaml` `agents:` block for `work` (agentConfig.ts survives for `suspec run`).
// A WORKSPACE leaf, not a Core service: like emit_agents and launch_adapter it NAMES runner CLIs,
// and the reconcile-only Core boundary (boundary.spec.ts) keeps agent names out of Core by
// construction — Core calls these through the Workspace barrel.

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type Runner = Readonly<{ name: string; command_template: string }>;

export type RunnerConfig = Readonly<{
    default: string | null;
    // name → command_template, exactly as declared in config.
    templates: ReadonlyMap<string, string>;
}>;

// The built-in adapters. `{store}` renders to the repo's store dir POST-SPLIT (see
// render_runner_command), so a store path with spaces stays one argv token; the Codex sandbox gets
// the store as a writable root because the agent appends to the run file there directly (AC-006).
const BUILTIN_TEMPLATES: ReadonlyMap<string, string> = new Map([
    ['claude', 'claude {prompt}'],
    ['codex', 'codex exec --sandbox workspace-write -c sandbox_workspace_write.writable_roots=["{store}"] {prompt}'],
]);

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

// Parse the `runners` map out of the parsed suspec.config.json. Any shape that is not a record of
// `{ command_template: string }` entries (plus the scalar `default`) parses to an empty config —
// the built-ins then carry resolution, so a config-less repo still launches (graceful degradation).
export function parse_runner_config(raw: unknown): RunnerConfig {
    if (!is_record(raw) || !is_record(raw.runners)) {
        return { default: null, templates: new Map() };
    }
    let dflt: string | null = null;
    const templates = new Map<string, string>();
    for (const [name, value] of Object.entries(raw.runners)) {
        if (name === 'default') {
            if (typeof value === 'string' && value.length > 0) {
                dflt = value;
            }
            continue;
        }
        if (
            is_record(value) &&
            typeof value.command_template === 'string' &&
            value.command_template.trim().length > 0
        ) {
            templates.set(name, value.command_template);
        }
    }
    return { default: dflt, templates };
}

// Resolve the runner a launch should use: the explicit `--runner <name>`, else `runners.default`,
// else the `claude` built-in (the reference adapter — a config-less repo still works, AC-025's
// direction). A config template shadows a built-in of the same name; an unknown name is a usage
// error (exit 2) listing every known runner.
export function resolve_runner(config: RunnerConfig, requested?: string): Result<Runner, AppError> {
    const name = requested ?? config.default ?? 'claude';
    const template = config.templates.get(name) ?? BUILTIN_TEMPLATES.get(name);
    if (template === undefined) {
        const known = [...new Set([...config.templates.keys(), ...BUILTIN_TEMPLATES.keys()])].sort();
        return err(createAppError('Usage', `unknown runner "${name}" — known runners: ${known.join(', ')}`, {}));
    }
    return ok({ name, command_template: template });
}

// Render a command template into an argv. The template is split on whitespace BEFORE the
// placeholders are substituted, so a prompt / cwd / store value containing spaces (or newlines —
// the prompt always does) stays exactly one argv token, and no shell ever parses it (the same
// no-shell surface as launch_adapter / run_setup).
export function render_runner_command(
    template: string,
    subs: Readonly<{ prompt: string; cwd: string; store: string }>
): readonly string[] {
    return template
        .trim()
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .map((token) =>
            token.replaceAll('{prompt}', subs.prompt).replaceAll('{cwd}', subs.cwd).replaceAll('{store}', subs.store)
        );
}

// The runner's NATIVE attach hint — `suspec work --attach` prints it and dispatches nothing.
// suspec records and points at the runner's own session commands; it never reimplements session
// management (ADR-0136 D6).
export function runner_attach_hint(name: string, worktreePath: string): string {
    if (name === 'claude') {
        return `cd ${worktreePath} && claude --continue`;
    }
    if (name === 'codex') {
        return `cd ${worktreePath} && codex resume`;
    }
    return `re-open your ${name} session in ${worktreePath}`;
}
