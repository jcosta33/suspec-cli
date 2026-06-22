#!/usr/bin/env node

// `swarm agents emit --codex [--from <dir>] [--force]` — project the Claude Code agent definitions
// (the swarm-agents `agents/*.md` form) into OpenAI Codex `.codex/agents/*.toml` (ADR-0098). Reuse,
// not duplication: the markdown defs stay the single source; this generates the Codex form. It writes
// definitions, never runs an agent (the reconcile-only posture holds, ADR-0077).
//
// Source resolution (no network): `--from <dir>` if given, else `./.claude/agents` if present, else
// `../swarm-agents/agents`. Honest scope: only the prose discipline ports — every emitted file says
// tool-scoping + hooks are Claude-Code-only.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { project, emit_error, usage_error } from '../../Core/useCases/index.ts';
import { emit_agents } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';

export function run(argv: string[], cwd: string = process.cwd()): number {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--json', '--codex', '--force'],
        strings: ['--from'],
    });
    const json = flags.get('json') === true;
    const sub = positional[0] ?? '';

    if (sub !== 'emit') {
        return emit_error(usage_error('usage: swarm agents emit --codex [--from <dir>] [--force]'), json);
    }
    // `--codex` is the only emit target today, and is the default so a bare `emit` works; the flag is
    // declared (accepted, not an error) so a future target can be added without breaking this surface.

    const fromFlag = flags.get('from');
    const from = typeof fromFlag === 'string' ? fromFlag : undefined;
    const sourceDir = resolve_agents_source(cwd, from);

    return project({
        result: emit_agents({ sourceDir, targetDir: cwd, overwrite: flags.get('force') === true }),
        json,
        render: (report) => {
            const lines = [`emitted Codex agents → ${report.target}`];
            if (report.written.length > 0) {
                lines.push(`  written: ${report.written.join(', ')}`);
            }
            if (report.skipped.length > 0) {
                lines.push(`  skipped (exists — re-run with --force): ${report.skipped.join(', ')}`);
            }
            lines.push('  note: tool-scoping + hooks are Claude-Code-only and did NOT travel (see each file header)');
            return lines.join('\n');
        },
    });
}

// Resolve the agent-definitions source dir: an explicit `--from`, else the local `.claude/agents`
// (a workspace that vendored its agents), else the sibling swarm-agents catalog. No network.
function resolve_agents_source(cwd: string, from: string | undefined): string {
    if (from !== undefined) {
        return resolve(cwd, from);
    }
    const local = resolve(cwd, '.claude', 'agents');
    if (existsSync(local)) {
        return local;
    }
    return resolve(cwd, '..', 'swarm-agents', 'agents');
}
