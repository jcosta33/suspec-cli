#!/usr/bin/env node

// `swarm worktree <create|list|remove|prune> …` — the launch engine's no-agent command surface
// (AC-009/010). Operates on a git repo (not a Swarm workspace): it resolves the repo root and works
// in any git repo, erroring cleanly outside one (AC-002). `swarm worktree` with no subcommand, or
// `-i`, opens the interactive flow.

import { ok, isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    create_worktree,
    list_swarm_worktrees,
    remove_worktree,
    prune_worktrees,
    is_safe_segment,
} from '../../Core/useCases/index.ts';
import { resolve_repo_root, current_branch, repo_has_commits } from '../../Workspace/useCases/index.ts';
import { parse_flags } from '../../Terminal/useCases/index.ts';
import { format_worktrees, run_worktree_flow, create_clack_prompter } from '../../Tui/useCases/index.ts';

export async function run(argv: string[], cwd: string = process.cwd()): Promise<number> {
    const { positional, flags } = parse_flags(argv, {
        booleans: ['--force', '--json', '-i', '--interactive'],
        strings: ['--base', '--task'],
    });
    const json = flags.get('json') === true;
    const interactive = flags.get('i') === true || flags.get('interactive') === true;
    const force = flags.get('force') === true;
    const baseFlag = flags.get('base');
    const taskFlag = flags.get('task');
    const base = typeof baseFlag === 'string' ? baseFlag : undefined;
    const taskSlug = typeof taskFlag === 'string' ? taskFlag : undefined;
    const subcommand = positional[0];

    /* v8 ignore start -- interactive dispatch is the thin shell; the flow logic is tested via the mock Prompter */
    if ((interactive || subcommand === undefined) && process.stdout.isTTY === true && !json) {
        return run_worktree_flow(create_clack_prompter(), { cwd });
    }
    /* v8 ignore stop */

    const rootResult = resolve_repo_root(cwd);
    if (isErr(rootResult)) {
        return emit_error(rootResult.error, json);
    }
    const repoRoot = rootResult.value;

    if (subcommand === 'create') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: swarm worktree create <slug> [--task <t>] [--base <branch>]'), json);
        }
        // The slug becomes a `.worktrees/<slug>` directory name — it must be a single safe segment so it
        // cannot escape (`../…`) or nest (`a/b/c`), the same guard scaffold/cut use (swarm-hq #22).
        if (!is_safe_segment(slug)) {
            return emit_error(usage_error(`invalid slug: "${slug}" — expected a single path-safe segment (no "/", "..", or leading "-")`), json);
        }
        if (taskSlug !== undefined && !is_safe_segment(taskSlug)) {
            return emit_error(usage_error(`invalid --task value: "${taskSlug}" — expected a single path-safe segment`), json);
        }
        // A flag-shaped --base would be passed to git as an option (`git worktree add … -x`); a base is a
        // git ref (may contain `/`), so it gets the leading-dash guard, not is_safe_segment.
        if (base?.startsWith('-') === true) {
            return emit_error(usage_error(`invalid --base value: "${base}" — expected a branch or commit`), json);
        }
        if (!repo_has_commits(repoRoot)) {
            return emit_error(
                usage_error('this repository has no commits yet — make an initial commit before creating a worktree'),
                json
            );
        }
        const baseBranch = base ?? current_branch(repoRoot) ?? 'main';
        return project({
            result: create_worktree({ repoRoot, specSlug: slug, taskSlug, baseBranch }),
            json,
            render: (report) => {
                const head = `${report.reused ? 'reusing' : 'created'} ${report.branch}\n  ${report.worktreePath}`;
                return report.port === null ? head : `${head}\n  runtime port ${report.port}`;
            },
        });
    }
    if (subcommand === 'list') {
        return project({
            result: ok(list_swarm_worktrees(repoRoot)),
            json,
            render: (report) => format_worktrees(report.worktrees),
        });
    }
    if (subcommand === 'remove') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: swarm worktree remove <slug> [--task <t>] [--force]'), json);
        }
        if (!is_safe_segment(slug)) {
            return emit_error(usage_error(`invalid slug: "${slug}" — expected a single path-safe segment`), json);
        }
        return project({
            result: remove_worktree({ repoRoot, specSlug: slug, taskSlug, force }),
            json,
            render: (report) => `removed ${report.branch}`,
        });
    }
    if (subcommand === 'prune') {
        return project({ result: prune_worktrees(repoRoot), json, render: () => 'pruned stale worktrees' });
    }
    if (subcommand === undefined) {
        return emit_error(
            usage_error(
                'usage: swarm worktree <create|list|remove|prune> [slug] [--task <t>] [--base <branch>] [--force]'
            ),
            json
        );
    }
    return emit_error(
        usage_error(`unknown worktree subcommand: ${subcommand} — use create | list | remove | prune`),
        json
    );
}
