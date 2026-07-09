// `suspec init`'s engine (SPEC-suspec-v2 AC-024): SEED the current repo, never scaffold a
// workspace. Suspec's artifacts live in the personal store outside the repo (ADR-0137), so init
// leaves exactly the in-repo footprint the harness needs and nothing else:
//   - `suspec.config.json`         defaults + the detected setup commands (lockfile autodetect)
//   - `AGENTS.md`                  a minimal self-contained seed, ONLY when absent (never merged)
//   - `.agents/skills/`            the repo-specific-guides dir, when absent
//   - `.claude/skills`             a relative symlink → `../.agents/skills`, when absent
//   - `CLAUDE.md`                  a symlink → `AGENTS.md`, only when the caller opted in
//   - `.gitignore`                 `.worktrees/` appended when missing
// It creates NO workspace folders, NO specs/ dir, NO board, and NEVER touches the store — the
// verify test snapshots the file list before/after and asserts exactly these writes.

import { lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ok, err, type Result } from '../../../infra/errors/result.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { resolve_setup_plan } from './resolveSetupPlan.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type SeedRepoInput = Readonly<{
    repoRoot: string;
    // Write the `CLAUDE.md → AGENTS.md` symlink. Offered via prompt on the interactive path;
    // `--yes` accepts it on the direct path. Default false — init never links unasked.
    linkClaudeMd: boolean;
    // The runner name seeded as `runners.default` — supplied by the surface from the Workspace
    // adapters (DEFAULT_RUNNER_NAME), because Core never names a runner CLI (boundary.spec).
    runnerDefault: string;
}>;

export type SeedRepoReport = Readonly<{
    level: OutcomeLevel; // always 'clean' — seeding an already-seeded repo is a no-op, not an error
    created: readonly string[]; // repo-relative entries written by this run
    updated: readonly string[]; // existing files extended in place (only ever `.gitignore`)
    kept: readonly string[]; // entries that already existed — left byte-untouched
}>;

// The seeded config: the graceful-no-config defaults (AC-025) made visible, plus the setup
// commands the lockfile autodetect found — so the file documents what the CLI would assume anyway
// and the developer edits values instead of discovering keys.
function render_config(setupCommands: readonly string[], runnerDefault: string): string {
    const config = {
        setup: setupCommands,
        setup_copy: [],
        verify: [],
        risk_paths: [],
        runners: { default: runnerDefault },
        wip_cap: 3,
        retention_days: 30,
    };
    return `${JSON.stringify(config, null, 4)}\n`;
}

// The AGENTS.md seed: the personal-harness paragraph, the Commands slot table skeleton, and the
// repo-specific-guides pointer. Self-contained — no kit fetch, nothing to keep in sync at init time.
const AGENTS_SEED = `# AGENTS.md

<!-- Keep this file short (~100 lines): agents read it on every task, so every line
     spends always-loaded budget. Facts and commands here; procedures in the guides. -->

## Suspec

This repo is worked with Suspec — a personal methodology harness for producing better
code faster with coding agents. Specs, task packets, review packets, and findings are
the agent's typed working memory: transient files in a personal store outside this
repo, never committed here. Durable value leaves by promotion — decisions become ADRs,
behavior becomes tests, findings become GitHub issues. The only Suspec files in this
repo are \`suspec.config.json\`, this seed, and whatever gets promoted.

## Skills

- The Suspec methodology skills install globally:
  \`npx skills add jcosta33/suspec-skills -g\`.
- Repo-specific guides — this repo's own conventions — live in \`.agents/skills/\`;
  Claude Code reads them via the \`.claude/skills\` symlink; point other tools at the
  same folder.

## Project facts

- {{stack, runtimes, package manager}}
- {{architecture rules an agent cannot infer}}
- {{house conventions that differ from defaults}}

## Commands

| Slot | Command | Purpose |
|---|---|---|
| cmdTest | \`{{npm test / pytest / …}}\` | run the test suite |
| cmdLint | \`{{eslint / ruff / …}}\` | static checks |
| cmdBuild | \`{{build command}}\` | production build |
| cmdTypecheck | \`{{tsc --noEmit / mypy}}\` | types |

An empty or missing slot means **ask** — never invent a command. A Verify item whose
command cannot be resolved reads Unverified, not Pass.
`;

// An entry exists for seeding purposes when ANYTHING sits at the path — a file, a dir, or a
// symlink (even dangling; `existsSync` follows links, so it would misread a dangling link as
// absent and the seed would clobber it).
function entry_exists(path: string): boolean {
    try {
        lstatSync(path);
        return true;
    } catch {
        return false;
    }
}

export function seed_repo(input: SeedRepoInput): Result<SeedRepoReport, AppError> {
    const created: string[] = [];
    const updated: string[] = [];
    const kept: string[] = [];

    const seed_file = (rel: string, content: string): void => {
        const path = join(input.repoRoot, rel);
        if (entry_exists(path)) {
            kept.push(rel);
            return;
        }
        writeFileSync(path, content);
        created.push(rel);
    };

    try {
        // 1. suspec.config.json — defaults + the detected setup (lockfile autodetect, AC-005 list).
        const plan = resolve_setup_plan({ repoRoot: input.repoRoot });
        seed_file('suspec.config.json', render_config(plan.commands, input.runnerDefault));

        // 2. AGENTS.md — seeded ONLY when absent; an existing bootloader is the developer's.
        seed_file('AGENTS.md', AGENTS_SEED);

        // 3. `.agents/skills/` — the repo-specific-guides dir.
        const skillsDir = join(input.repoRoot, '.agents', 'skills');
        if (entry_exists(skillsDir)) {
            kept.push('.agents/skills/');
        } else {
            mkdirSync(skillsDir, { recursive: true });
            created.push('.agents/skills/');
        }

        // 4. `.claude/skills → ../.agents/skills` — a RELATIVE link so the repo moves freely.
        const claudeSkills = join(input.repoRoot, '.claude', 'skills');
        if (entry_exists(claudeSkills)) {
            kept.push('.claude/skills');
        } else {
            mkdirSync(join(input.repoRoot, '.claude'), { recursive: true });
            symlinkSync(join('..', '.agents', 'skills'), claudeSkills);
            created.push('.claude/skills');
        }

        // 5. `CLAUDE.md → AGENTS.md` — opt-in only (prompted interactively; `--yes` accepts).
        const claudeMd = join(input.repoRoot, 'CLAUDE.md');
        if (entry_exists(claudeMd)) {
            kept.push('CLAUDE.md');
        } else if (input.linkClaudeMd) {
            symlinkSync('AGENTS.md', claudeMd);
            created.push('CLAUDE.md');
        }

        // 6. `.gitignore` — append `.worktrees/` when missing (`suspec work` puts worktrees there;
        // committing one stages an embedded gitlink). A plain line append, never a managed block.
        const gitignorePath = join(input.repoRoot, '.gitignore');
        if (!entry_exists(gitignorePath)) {
            writeFileSync(gitignorePath, '.worktrees/\n');
            created.push('.gitignore');
        } else {
            const existing = readFileSync(gitignorePath, 'utf8');
            const hasLine = existing
                .split(/\r\n|[\r\n]/)
                .some((line) => line.trim() === '.worktrees/' || line.trim() === '.worktrees');
            if (hasLine) {
                kept.push('.gitignore');
            } else {
                const glue = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
                writeFileSync(gitignorePath, `${existing}${glue}.worktrees/\n`);
                updated.push('.gitignore');
            }
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return err(
            createAppError('seed_write_failed', `could not seed ${input.repoRoot}: ${reason}`, {
                repoRoot: input.repoRoot,
            })
        );
    }

    return ok({ level: 'clean', created, updated, kept });
}
