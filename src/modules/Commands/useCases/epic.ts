#!/usr/bin/env node

import { bold, cyan, dim, green, parse_args, red } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

export function parseEpicTasks(content: string): string[] {
    const lines = content.split('\n');
    const tasks: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const taskName = trimmed.slice(2).trim();
            if (taskName) tasks.push(taskName);
        }
    }

    return tasks;
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {

        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const epicFile = positional[0];

    if (!epicFile) {
        console.log(red('Usage: swarm epic <path/to/epic.md>'));
        console.log(dim('The markdown file should contain a markdown list of tasks.'));
        return 1;
    }

    const fullPath = join(repoRoot, epicFile);
    if (!existsSync(fullPath)) {
        console.error(red(`File not found: ${epicFile}`));
        return 1;
    }

    const content = readFileSync(fullPath, 'utf8');
    const epicSlug = basename(epicFile, '.md');
    const tasks = parseEpicTasks(content);

    console.log(cyan(`\nDecomposing Epic: ${bold(epicSlug)}...`));

    if (tasks.length === 0) {
        console.log(dim('  (No markdown list items found in epic file)'));
        return 0;
    }

    const tasksDir = join(repoRoot, '.agents', 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    tasks.forEach((task, i) => {
        const taskSlug = `${epicSlug}-task-${(i + 1).toString()}`;
        const taskPath = join(tasksDir, `${taskSlug}.md`);

        const template = `# ${task}

## Metadata

- Slug: ${taskSlug}
- Parent: ${epicSlug}
- Status: pending
- Created: ${new Date().toISOString()}

---

## Objective

${task} (Derived from Epic ${epicSlug})

## Progress checklist

- [ ] Complete implementation
- [ ] Pass \`swarm validate\`

## Next steps

- Read the parent epic for context.
`;
        writeFileSync(taskPath, template, 'utf8');
        console.log(green(`  ✓ Created task: `) + dim(taskSlug));
    });

    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
