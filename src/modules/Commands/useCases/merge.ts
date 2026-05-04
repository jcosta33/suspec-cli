#!/usr/bin/env node

import { parse_args, red, green, dim, cyan, summarize_insight } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { spawnSync } from 'child_process';

type MergeResult = {
    success: boolean;
    branch: string;
    conflicts?: string[];
};

function merge_branch(repoRoot: string, branch: string): MergeResult {
    const result = spawnSync('git', ['merge', '--no-ff', '--no-commit', branch], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    const output = result.stdout + result.stderr;
    const conflicts: string[] = [];
    const conflictRegex = /CONFLICT \(([^)]+)\): ([^\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = conflictRegex.exec(output)) !== null) {
        conflicts.push(`${match[2].trim()} (${match[1]})`);
    }

    if (conflicts.length > 0 || result.status !== 0) {
        spawnSync('git', ['merge', '--abort'], { cwd: repoRoot, stdio: 'pipe' });
        return { success: false, branch, conflicts: conflicts.length > 0 ? conflicts : undefined };
    }

    const diffResult = spawnSync('git', ['diff', '--cached', '--quiet'], {
        cwd: repoRoot,
        stdio: 'pipe',
    });

    if (diffResult.status === 0) {
        // No changes staged — abort the empty merge
        spawnSync('git', ['merge', '--abort'], { cwd: repoRoot, stdio: 'pipe' });
        return { success: true, branch };
    }

    const commitResult = spawnSync('git', ['commit', '-m', `Merge branch '${branch}'`], {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
    });

    if (commitResult.status !== 0) {
        spawnSync('git', ['merge', '--abort'], { cwd: repoRoot, stdio: 'pipe' });
        return { success: false, branch, conflicts: ['Merge succeeded but commit failed.'] };
    }

    return { success: true, branch };
}

function get_matching_branches(repoRoot: string, pattern: string): string[] {
    const result = spawnSync('git', ['branch', '--list', pattern], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (result.status !== 0) {
        return [];
    }

    return result.stdout
        .split('\n')
        .map((b) => b.trim().replace(/^[+*]\s*/, ''))
        .filter((b) => b.length > 0);
}

export async function run(): Promise<number> {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { flags, positional } = parse_args(process.argv.slice(2));
    const cascadeRaw = flags.get('cascade');
    const cascade = cascadeRaw === true || (typeof cascadeRaw === 'string' && cascadeRaw.length > 0);

    if (cascade) {
        const pattern = typeof cascadeRaw === 'string' && cascadeRaw.length > 0 ? cascadeRaw : positional[0];
        if (!pattern) {
            console.error(red('Usage: swarm merge --cascade <branch-pattern>'));
            return 1;
        }

        const branches = get_matching_branches(repoRoot, pattern);
        if (branches.length === 0) {
            console.log(dim(`No branches matched pattern: ${pattern}`));
            return 0;
        }

        console.log(dim(`Cascade merging ${String(branches.length)} branch(es): ${branches.join(', ')}\n`));

        for (const branch of branches) {
            const mergeResult = merge_branch(repoRoot, branch);
            if (!mergeResult.success) {
                console.error(red(`Failed to merge ${branch}`));
                console.log(JSON.stringify(mergeResult, null, 2));
                return 1;
            }
            console.log(green(`Merged ${branch}`));
        }

        console.log(green('\nCascade merge complete.'));
        
        const insightPrompt = `I just cascade merged these branches: ${branches.join(', ')}. The result was successful. Summarize this in one short sentence for the developer.`;
        const insight = await summarize_insight(repoRoot, insightPrompt);
        if (insight) {
            console.log(cyan(`✨ AI Insight: `) + dim(insight));
        }
        
        return 0;
    }

    const branch = positional[0];
    if (!branch) {
        console.error(red('Usage: swarm merge <branch>'));
        return 1;
    }

    const mergeResult = merge_branch(repoRoot, branch);
    console.log(JSON.stringify(mergeResult, null, 2));
    
    if (mergeResult.success) {
        const insightPrompt = `I just merged branch ${branch}. The result was successful. Summarize this in one short sentence for the developer.`;
        const insight = await summarize_insight(repoRoot, insightPrompt);
        if (insight) {
            console.log(cyan(`\n✨ AI Insight: `) + dim(insight));
        }
    } else {
        const insightPrompt = `I just tried to merge branch ${branch}, but it failed with conflicts: ${JSON.stringify(mergeResult.conflicts)}. Suggest a next step in one short sentence.`;
        const insight = await summarize_insight(repoRoot, insightPrompt);
        if (insight) {
            console.log(cyan(`\n✨ AI Insight: `) + dim(insight));
        }
    }
    
    return mergeResult.success ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void run().then(code => {
        process.exitCode = code;
    });
}
