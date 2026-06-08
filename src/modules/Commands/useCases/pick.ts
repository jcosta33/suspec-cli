#!/usr/bin/env node

import {
    fzf_select,
    parse_args,
    red,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';

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
    const action = positional[0] ?? 'open';

    const sandboxes = worktree_list(repoRoot);
    const items = sandboxes
        .map((w) => w.branch?.replace('agent/', ''))
        .filter((slug): slug is string => Boolean(slug));

    if (items.length === 0) {
        console.log(yellow('No sandboxes found.'));
        return 0;
    }

    const selected = fzf_select(items);
    if (!selected) {
        console.log(red('No selection made.'));
        return 1;
    }

    const slug = Array.isArray(selected) ? selected[0] : selected;
    if (!slug) {
        console.log(red('No selection made.'));
        return 1;
    }

    const validActions = ['new', 'open', 'focus', 'show'];
    if (!validActions.includes(action)) {
        console.error(red(`Unknown action: ${action}. Valid: ${validActions.join(', ')}`));
        return 1;
    }

    const res = spawnSync(
        process.execPath,
        ['--experimental-strip-types', new URL(`./${action}.ts`, import.meta.url).pathname, slug],
        {
            stdio: 'inherit',
            cwd: repoRoot,
        }
    );

    if (res.signal) {
        process.kill(process.pid, res.signal);
        return 1;
    } else {
        return res.status ?? 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
