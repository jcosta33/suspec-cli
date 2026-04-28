#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { red, green, cyan, bold, dim, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';

function findWorktreePath(slug: string, repoRoot: string) {
    const worktrees = worktree_list(repoRoot);
    const match = worktrees.find((w) => w.branch === `agent/${slug}`);
    return match ? match.path : null;
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const slug = positional[0];
    
    if (!slug) {
        console.log(red('Usage: swarm pr <slug> [--push] [--draft] [--base <branch>]'));
        return 1;
    }

    const worktreeAbs = findWorktreePath(slug, repoRoot);
    if (!worktreeAbs) {
        console.error(red(`No active worktree found for "${slug}".`));
        return 1;
    }

    const taskFile = join(worktreeAbs, '.agents', 'tasks', `${slug}.md`);
    if (!existsSync(taskFile)) {
        console.error(red(`Task file not found at ${taskFile}`));
        return 1;
    }

    // Extract objective as PR title
    const content = readFileSync(taskFile, 'utf8');
    const objMatch = /## Objective\n+([^#]+)/.exec(content);
    const objective = objMatch ? objMatch[1].trim().split('\n')[0] : `Implement ${slug}`;

    console.log(cyan(`\nAuto-generating PR for ${bold(slug)}...`));
    console.log(dim(`Objective: ${objective}`));

    // Add changes
    spawnSync('git', ['add', '.'], { cwd: worktreeAbs });

    // Commit
    const commitMsg = `feat(${slug}): ${objective}\n\nAutomated commit via Swarm PR generator.`;
    const commitRes = spawnSync('git', ['commit', '-m', commitMsg], { cwd: worktreeAbs, stdio: 'inherit' });

    if (commitRes.status === 0) {
        console.log(green(`\n✓ Changes committed successfully.`));
    } else {
        console.log(yellow(`\n✗ Git commit failed (maybe no changes to commit?).`));
    }

    const branch = `agent/${slug}`;
    const { flags } = parse_args(process.argv.slice(2));
    const shouldPush = flags.get('push') === true;
    const draft = flags.get('draft') === true;
    const base = (flags.get('base') as string | undefined) ?? 'main';

    if (!shouldPush) {
        console.log(yellow(`To open a PR, push your branch and run \`gh pr create\`:`));
        console.log(dim(`  git push -u origin ${branch}`));
        console.log(dim(`  gh pr create --base ${base} --title "${objective}" --body-file ${taskFile}`));
        console.log(dim(`Or rerun with --push to do this automatically.`));
        return 0;
    }

    console.log(cyan(`\nPushing ${branch}...`));
    const pushRes = spawnSync('git', ['push', '-u', 'origin', branch], { cwd: worktreeAbs, stdio: 'inherit' });
    if (pushRes.status !== 0) {
        console.error(red('git push failed.'));
        return 1;
    }

    const ghCheck = spawnSync('gh', ['--version'], { stdio: 'pipe' });
    if (ghCheck.status !== 0) {
        console.log(yellow('`gh` CLI not found — branch pushed but no PR created.'));
        return 0;
    }

    const ghArgs = ['pr', 'create', '--base', base, '--title', objective, '--body-file', taskFile];
    if (draft) {
        ghArgs.push('--draft');
    }
    const ghRes = spawnSync('gh', ghArgs, { cwd: worktreeAbs, stdio: 'inherit' });
    if (ghRes.status === 0) {
        console.log(green(`\n✓ PR opened.`));
        return 0;
    }
    console.error(red('gh pr create failed.'));
    return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
