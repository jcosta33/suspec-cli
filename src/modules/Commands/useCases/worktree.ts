#!/usr/bin/env node

// `suspec worktree <create|list|remove|prune> …` — the launch engine's no-agent command surface
// (AC-009/010). Operates on a git repo (not a Suspec workspace): it resolves the repo root and works
// in any git repo, erroring cleanly outside one (AC-002). `suspec worktree` with no subcommand, or
// `-i`, opens the interactive flow.

import { ok, isErr } from '../../../infra/errors/result.ts';
import {
    project,
    emit_error,
    usage_error,
    create_worktree,
    list_suspec_worktrees,
    remove_worktree,
    prune_worktrees,
    is_safe_segment,
    resolve_task,
    list_task_ids,
    task_slug,
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
            return emit_error(usage_error('usage: suspec worktree create <slug> [--task <t>] [--base <branch>]'), json);
        }
        // The slug becomes a `.worktrees/<slug>` directory name — it must be a single safe segment so it
        // cannot escape (`../…`) or nest (`a/b/c`), the same guard scaffold/cut use (suspec-works #22).
        if (!is_safe_segment(slug)) {
            return emit_error(
                usage_error(
                    `invalid slug: "${slug}" — expected a single path-safe segment (no "/", "..", or leading "-")`
                ),
                json
            );
        }
        if (taskSlug !== undefined && !is_safe_segment(taskSlug)) {
            return emit_error(
                usage_error(`invalid --task value: "${taskSlug}" — expected a single path-safe segment`),
                json
            );
        }
        // SW-005: tie --task to a REAL cut task so the worktree branch tail matches what `suspec review`
        // and `suspec run` later look up. The worker naturally passes a capability name (`create-list`)
        // while the task id is `TASK-potluck-create-list`; the branch tail derives from the task id, so
        // the guessed name produced a branch nothing could find, and the old error suggested an
        // impossible recovery. Resolve --task against the workspace tasks (co-located layout) and derive
        // the tail from the canonical id; if it names nothing, fail EARLY with the valid options. When no
        // tasks/ is visible here (split-repo, or the task isn't cut yet) we can't validate — pass it
        // through and let create_worktree normalize it.
        let effectiveTaskSlug = taskSlug;
        if (taskSlug !== undefined) {
            const resolvedTask = resolve_task(repoRoot, taskSlug);
            if (resolvedTask !== null) {
                effectiveTaskSlug = task_slug(resolvedTask.id);
                // The raw --task was validated above, but the resolved value derives from the task file's
                // frontmatter `id:` — re-validate it as a path-safe segment so a crafted id (e.g.
                // `TASK-x/../y`) can never become the branch tail / `.worktrees/` dir name (defense in
                // depth: git's ref-name rules also reject it, but Suspec should not rely on that alone).
                if (!is_safe_segment(effectiveTaskSlug)) {
                    return emit_error(
                        usage_error(
                            `task "${resolvedTask.id}" derives an unsafe branch segment "${effectiveTaskSlug}" — its frontmatter id must be a single path-safe segment`
                        ),
                        json
                    );
                }
            } else {
                const ids = list_task_ids(repoRoot);
                if (ids.length > 0) {
                    return emit_error(
                        usage_error(
                            `no task matching "${taskSlug}" in this workspace — cut it first with ` +
                                `\`suspec new task --from <SPEC-id> --id <TASK-id>\`, or name one of: ${ids.join(', ')}`
                        ),
                        json
                    );
                }
            }
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
            result: create_worktree({ repoRoot, specSlug: slug, taskSlug: effectiveTaskSlug, baseBranch }),
            json,
            render: (report) => {
                let out = `${report.reused ? 'reusing' : 'created'} ${report.branch}\n  ${report.worktreePath}`;
                if (report.port !== null) {
                    out += `\n  runtime port ${report.port}`;
                }
                if (report.baseAheadOfRemote !== null && report.baseAheadOfRemote > 0) {
                    out += `\n  advisory: base "${baseBranch}" is ${report.baseAheadOfRemote} commit(s) ahead of its remote — a PR from this worktree may carry unpushed base commits; push the base first.`;
                }
                return out;
            },
        });
    }
    if (subcommand === 'list') {
        return project({
            result: ok(list_suspec_worktrees(repoRoot)),
            json,
            render: (report) => format_worktrees(report.worktrees),
        });
    }
    if (subcommand === 'remove') {
        const slug = positional[1];
        if (slug === undefined) {
            return emit_error(usage_error('usage: suspec worktree remove <slug> [--task <t>] [--force]'), json);
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
                'usage: suspec worktree <create|list|remove|prune> [slug] [--task <t>] [--base <branch>] [--force]'
            ),
            json
        );
    }
    return emit_error(
        usage_error(`unknown worktree subcommand: ${subcommand} — use create | list | remove | prune`),
        json
    );
}
