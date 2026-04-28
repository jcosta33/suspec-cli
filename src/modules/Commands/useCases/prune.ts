#!/usr/bin/env node

import {
    cyan,
    dim,
    green,
    red,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { load_config } from '../../Terminal/useCases/index.ts';
import { remove_state } from '../../AgentState/useCases/index.ts';
import {
    delete_branch,
    get_repo_root,
    is_branch_merged_into,
    worktree_list,
    worktree_prune,
    worktree_remove,
} from '../../Workspace/useCases/index.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const config = load_config(repoRoot);
    const baseBranch = config.defaultBaseBranch ?? 'main';
    const sandboxes = worktree_list(repoRoot);

    console.log(cyan('\n🧹 Pruning Swarm Sandboxes\n'));

    let removedCount = 0;

    for (const s of sandboxes) {
        const slug = s.branch?.replace('agent/', '');
        if (!slug || slug === 'main' || slug === baseBranch) continue;

        const isMerged = is_branch_merged_into(
            s.branch ?? '',
            baseBranch,
            repoRoot
        );

        if (isMerged) {
            console.log(
                yellow(`Removing merged sandbox: ${slug}`)
            );
            const removeResult = worktree_remove(s.path, true, repoRoot);
            if (!removeResult.ok) {
                console.error(red(`  ✗ Failed to remove ${slug}: ${removeResult.error.message}`));
                continue;
            }
            const deleteResult = delete_branch(s.branch ?? '', repoRoot, true);
            if (!deleteResult.ok) {
                console.error(red(`  ✗ Failed to remove ${slug}: ${deleteResult.error.message}`));
                continue;
            }
            remove_state(repoRoot, slug);
            removedCount++;
            console.log(green(`  ✓ Removed ${slug}`));
        }
    }

    // Also prune any stale git worktree refs
    worktree_prune(repoRoot);

    if (removedCount === 0) {
        console.log(dim('No merged sandboxes to prune.'));
    } else {
        console.log(green(`\nPruned ${removedCount.toString()} sandbox(es).`));
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
