#!/usr/bin/env node

import {
    bold,
    cyan,
    parse_args,
    red,
    fzf_select,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { read_state } from '../../AgentState/useCases/index.ts';
import {
    find_worktree_for_branch,
    get_repo_root,
    worktree_list,
} from '../../Workspace/useCases/index.ts';

import { run_agent_launch } from './launch-agent.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    let slug = positional[0];

    if (!slug) {
        const sandboxes = worktree_list(repoRoot);
        const items = sandboxes.map((w) => w.branch?.replace('agent/', '')).filter((s): s is string => !!s);
        if (items.length === 0) {
            console.log(yellow('No active sandboxes.'));
            return 1;
        }
        
        try {
            const selected = fzf_select(items);
            if (!selected) {
                console.log(red('No selection made.'));
                return 1;
            }
            slug = Array.isArray(selected) ? selected[0] : selected;
        } catch (e: unknown) {
            console.log(red('Usage: swarm open <slug>'));
            const message = e instanceof Error ? e.message : String(e);
            console.log(yellow(`(Fuzzy search failed: ${message})`));
            return 1;
        }
    }

    const matchPath = find_worktree_for_branch(`agent/${slug}`, repoRoot);

    if (!matchPath) {
        console.error(red(`No sandbox found for slug "${slug}".`));
        return 1;
    }

    const state = read_state(repoRoot)[slug] ?? {};
    const agent = state.agent ?? undefined;

    console.log(cyan(`Opening ${bold(slug)}...`));

    return run_agent_launch({ repoRoot, slug, worktreePath: matchPath, agent });
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        process.exitCode = run();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(`Unexpected error: ${message}`));
        process.exitCode = 1;
    }
}
