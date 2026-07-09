// The interactive `init` flow (SPEC-suspec-v2 AC-024): show the seed plan, confirm, offer the
// `CLAUDE.md → AGENTS.md` symlink, seed, then show the created/updated/kept summary and the
// global-skill install hint. Pure over the injected Prompter + the seed engine.

import { existsSync } from 'fs';
import { join } from 'path';

import { seed_repo, exit_code_for } from '../../Core/useCases/index.ts';
import { DEFAULT_RUNNER_NAME } from '../../Workspace/useCases/index.ts';
import { isErr } from '../../../infra/errors/result.ts';
import { type Prompter, is_cancelled } from './prompter.ts';
import { format_seed_report } from '../services/render.ts';

export type InitFlowDeps = Readonly<{ repoRoot: string }>;

const SKILL_INSTALL_HINT = 'methodology skills install globally: npx skills add jcosta33/suspec-skills -g';

export async function run_init_flow(prompter: Prompter, deps: InitFlowDeps): Promise<number> {
    prompter.intro('suspec init');
    prompter.note(
        `Repo: ${deps.repoRoot}\nSeeds suspec.config.json, AGENTS.md (if absent), .agents/skills/ +\nthe .claude/skills symlink, and a .worktrees/ gitignore line.\nArtifacts live in your personal store — nothing else lands in the repo.`,
        'Plan'
    );

    const proceed = await prompter.confirm({ message: 'Seed this repo?', initialValue: true });
    if (is_cancelled(proceed) || !proceed) {
        prompter.outro('Cancelled.');
        return 1;
    }

    // The CLAUDE.md offer: only meaningful when no CLAUDE.md exists yet (an existing one is kept).
    let linkClaudeMd = false;
    if (!existsSync(join(deps.repoRoot, 'CLAUDE.md'))) {
        const link = await prompter.confirm({
            message: 'Link CLAUDE.md → AGENTS.md (Claude Code reads AGENTS.md through it)?',
            initialValue: true,
        });
        if (is_cancelled(link)) {
            prompter.outro('Cancelled.');
            return 1;
        }
        linkClaudeMd = link;
    }

    const result = seed_repo({ repoRoot: deps.repoRoot, linkClaudeMd, runnerDefault: DEFAULT_RUNNER_NAME });
    if (isErr(result)) {
        prompter.error(result.error.message);
        prompter.outro('✗ could not seed');
        return 2;
    }

    prompter.note(format_seed_report(result.value), 'Result');
    prompter.outro(`✓ seeded — next: ${SKILL_INSTALL_HINT}`);
    return exit_code_for(result.value.level);
}
