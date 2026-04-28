#!/usr/bin/env node

import {
    parse_args,
    red,
    split_command,
    fzf_select,
    yellow,
} from '../../Terminal/useCases/index.ts';
import {
    get_repo_root,
    worktree_list,
} from '../../Workspace/useCases/index.ts';

import { spawnSync } from 'child_process';

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
            console.log(red('Usage: swarm focus <slug>'));
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

    // Split EDITOR on whitespace so values like "code-insiders --wait" work,
    // but never invoke a shell — that would let EDITOR=`code; rm -rf` inject commands.
    const editor = process.env.EDITOR?.trim() ?? 'code';
    const { program, args } = split_command(editor);
    if (!program) {
        console.error(red('No editor configured. Set the EDITOR environment variable.'));
        return 1;
    }
    const res = spawnSync(program, [...args, match.path], {
        stdio: 'inherit',
        shell: false,
    });

    if (res.status !== 0) {
        console.error(red(`Failed to open editor.`));
        return 1;
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
