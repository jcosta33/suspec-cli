// EmitAgents (`swarm agents emit --codex`, ADR-0098). Reads the Claude Code agent definitions in a
// source dir (the swarm-agents `agents/*.md` form) and projects each into an OpenAI Codex
// `.codex/agents/<name>.toml`. Reuse, not duplication: the `agents/*.md` files stay the single source;
// this GENERATES the Codex form, so the two never drift by hand. No agent is launched, no network —
// it reads markdown and writes TOML (the reconcile-only posture, ADR-0077, holds: it emits a
// definition, never runs one).

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { parse_agent_def, render_codex_agent } from './codexToml.ts';
import { write_new_file } from './files.ts';

export type EmitAgentsInput = Readonly<{
    // The dir holding the agent `*.md` definitions (default resolved by the command: ./.claude/agents,
    // else ../swarm-agents/agents).
    sourceDir: string;
    // The workspace root the `.codex/agents/` tree is written under.
    targetDir: string;
    // Overwrite an existing `.codex/agents/<name>.toml` (the files are generated, so re-emit replaces).
    overwrite: boolean;
}>;

export type EmitAgentsReport = Readonly<{
    // 'clean' | 'warning' (the unixOutcome levels, inlined — Workspace is a leaf and must not import
    // Core; the command projects this through Core's `project()` structurally). Never 'blocking'.
    level: 'clean' | 'warning';
    target: string; // the .codex/agents dir written into
    written: readonly string[]; // <name>.toml files written
    skipped: readonly string[]; // existing files left in place (no --force)
}>;

export function emit_agents(input: EmitAgentsInput): Result<EmitAgentsReport, AppError> {
    if (!existsSync(input.sourceDir)) {
        return err(
            createAppError(
                'AgentsSourceMissing',
                `no agent definitions found at ${input.sourceDir} — pass --from <dir> (e.g. ../swarm-agents/agents)`,
                { source: input.sourceDir }
            )
        );
    }

    const defFiles = readdirSync(input.sourceDir)
        .filter((entry) => entry.endsWith('.md') && entry.toUpperCase() !== 'README.MD')
        .sort();

    const written: string[] = [];
    const skipped: string[] = [];
    const targetRoot = resolve(input.targetDir, '.codex', 'agents');

    try {
        for (const file of defFiles) {
            const def = parse_agent_def(readFileSync(join(input.sourceDir, file), 'utf8'));
            if (def === null) {
                continue; // not an agent definition (no frontmatter / no name) — skip quietly
            }
            const outPath = join(targetRoot, `${def.name}.toml`);
            // write_new_file errs only on a no-clobber collision (an existing file, no --force) → skip it;
            // a real write failure (EACCES) throws and is caught below.
            const result = write_new_file(outPath, render_codex_agent(def), { overwrite: input.overwrite });
            (result.ok ? written : skipped).push(`${def.name}.toml`);
        }
    } catch (error) {
        /* v8 ignore next 4 -- an mkdir/write EACCES on the target; surfaced through Result rather than escaping */
        const reason = error instanceof Error ? error.message : String(error);
        return err(createAppError('AgentsEmitFailed', `could not emit Codex agents: ${reason}`, { target: targetRoot }));
    }

    if (written.length === 0 && skipped.length === 0) {
        return err(
            createAppError('AgentsSourceEmpty', `no agent definitions to emit in ${input.sourceDir}`, {
                source: input.sourceDir,
            })
        );
    }

    return ok({
        level: skipped.length > 0 ? 'warning' : 'clean',
        target: targetRoot,
        written,
        skipped,
    });
}
