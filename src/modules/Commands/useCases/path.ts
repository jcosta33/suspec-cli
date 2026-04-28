#!/usr/bin/env node

import {
    parse_args,
    red,
    yellow,
    fzf_select,
} from '../../Terminal/useCases/index.ts';
import {
    get_repo_root,
    worktree_list,
} from '../../Workspace/useCases/index.ts';

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
            console.log(red('Usage: swarm path <slug>'));
            const message = e instanceof Error ? e.message : String(e);
            console.log(yellow(`(Fuzzy search failed: ${message})`));
            return 1;
        }
    }

    const sandboxes = worktree_list(repoRoot);
    const match = sandboxes.find((w) => w.branch === `agent/${slug}`);

    if (!match) {
        console.error(red(`No sandbox found for slug "${slug}".`));
        return 1;
    }

    console.log(match.path);
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
