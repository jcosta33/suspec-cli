#!/usr/bin/env node

// `suspec init` — seed the current repo for the personal harness (SPEC-suspec-v2 AC-024). Writes
// `suspec.config.json` (defaults + detected setup), seeds `AGENTS.md` when absent, creates
// `.agents/skills/` + the `.claude/skills` symlink, appends `.worktrees/` to `.gitignore`, and
// prints the global-skill install hint. The `CLAUDE.md → AGENTS.md` symlink is offered via the
// interactive prompt; `--yes` accepts it here. No workspace folders, no specs/ dir, no board, and
// the store is never touched — artifacts live outside the repo (ADR-0137).
//   suspec init            seed the repo (idempotent — existing files are kept, never merged)
//   suspec init --yes      also link CLAUDE.md → AGENTS.md (accept every offer)
//   suspec init -i         the interactive flow (prompts for the CLAUDE.md link)
//   suspec init --json     machine output

import { isErr } from '../../../infra/errors/result.ts';
import { project, seed_repo } from '../../Core/useCases/index.ts';
import { resolve_repo_root, DEFAULT_RUNNER_NAME } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_seed_report, run_init_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export const SKILL_INSTALL_HINT = 'methodology skills install globally: npx skills add jcosta33/suspec-skills -g';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { flags } = parse_flags(argv, {
        booleans: ['--json', '-i', '--interactive', '--yes'],
        strings: [],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const yes = flags.get('yes') === true;

    // Seed the repo root when the cwd sits inside a git repo; a plain directory seeds in place —
    // init needs no git (AC-025: a runtime dependency errors only on the command that needs it).
    const rootResult = resolve_repo_root(cwd);
    const repoRoot = isErr(rootResult) ? cwd : rootResult.value;

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if (interactive && process.stdout.isTTY === true && !json) {
        return run_init_flow(create_clack_prompter(), { repoRoot });
    }
    /* v8 ignore stop */

    return project({
        result: seed_repo({ repoRoot, linkClaudeMd: yes, runnerDefault: DEFAULT_RUNNER_NAME }),
        json,
        render: (report) => {
            const lines = [format_seed_report(report)];
            if (!yes && !report.kept.includes('CLAUDE.md') && !report.created.includes('CLAUDE.md')) {
                lines.push('tip: --yes (or -i) also links CLAUDE.md → AGENTS.md for Claude Code.');
            }
            lines.push(`next: ${SKILL_INSTALL_HINT}`);
            return lines.join('\n');
        },
    });
}
