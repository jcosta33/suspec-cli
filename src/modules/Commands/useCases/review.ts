#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { red, cyan, bold, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

const newCommandPath = join(dirname(fileURLToPath(import.meta.url)), 'new.ts');

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const targetSlug = positional[0];
    
    if (!targetSlug) {
        console.log(red('Usage: swarm review <slug-to-review>'));
        return 1;
    }

    console.log(cyan(`\nRequesting Peer Review for: ${bold(targetSlug)}...`));

    // First check if the branch exists
    const branchName = `agent/${targetSlug}`;
    const checkBranch = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd: repoRoot });
    if (checkBranch.status !== 0) {
        console.error(red(`Branch ${branchName} does not exist. Cannot review.`));
        return 1;
    }

    // Launch a new agent targeting that branch as its base
    const reviewSlug = `${targetSlug}-review`;
    
    console.log(dim(`Spawning adversarial reviewer: ${reviewSlug} (Base: ${branchName})`));

    // Create a specific review task
    const tasksDir = join(repoRoot, '.agents', 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });
    
    const taskPath = join(tasksDir, `${reviewSlug}.md`);
    const template = `# Review: ${targetSlug}

## Metadata

- Slug: ${reviewSlug}
- Agent: claude
- Parent: ${targetSlug}

---

> **PERSONA:** Load \`.agents/skills/personas/SKILL.md\` and adopt **The Skeptic** persona.
> **MANDATE:** You are the adversarial reviewer for branch \`${branchName}\`. 
> 1. Run \`git diff main...HEAD\` to see what the original agent changed.
> 2. Run the tests. Check the blast radius. Look for architectural violations.
> 3. You MUST either approve the PR by closing this task, or leave feedback in this task file and FAIL.

## Objective
Review the changes made in \`${targetSlug}\` and ensure they are flawless.
`;
    writeFileSync(taskPath, template, 'utf8');

    // Automatically invoke `swarm new`
    const res = spawnSync(process.execPath, ['--experimental-strip-types', newCommandPath, reviewSlug, '--base', branchName], { stdio: 'inherit', cwd: repoRoot });
    
    if (res.status === 0) {
        console.log(green(`\n✓ Reviewer agent launched successfully.`));
    } else {
        console.error(red(`\n✗ Failed to launch reviewer agent.`));
        return 1;
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
