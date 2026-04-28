#!/usr/bin/env node

import { existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { spinner } from '@clack/prompts';
import { red, cyan, bold, dim, green, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

export function findFiles(dir: string): string[] {
    let results: string[] = [];
    try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
            const fullPath = join(dir, entry);
            if (statSync(fullPath).isDirectory()) {
                results = results.concat(findFiles(fullPath));
            } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
                results.push(fullPath);
            }
        }
    } catch (_e) {
        // Ignore
    }
    return results;
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional, flags } = parse_args(process.argv.slice(2));
    const targetDir = positional[0];
    const goal = positional.slice(1).join(' ') || String(flags.get('goal') ?? '');
    
    if (!targetDir || !goal) {
        console.log(red('Usage: swarm refactor <directory> <goal>'));
        console.log(dim('Example: swarm refactor src/modules "Move all inline GraphQL to Repositories"'));
        return 1;
    }

    const fullPath = join(repoRoot, targetDir);
    if (!existsSync(fullPath)) {
        console.error(red(`Directory not found: ${targetDir}`));
        return 1;
    }

    console.log(cyan(`\nOrchestrating Large-Scale Refactor...\n`));
    console.log(dim(`Target: ${targetDir}`));
    console.log(dim(`Goal: ${goal}\n`));

    const s = spinner();
    s.start(`Scanning ${targetDir} for source files...`);
    const files = findFiles(fullPath);
    if (files.length === 0) {
        s.stop(yellow(`No source files found in ${targetDir}.`));
        return 0;
    }

    s.stop(`Found ${bold(String(files.length))} files. Chunking into bisectable tasks...`);

    const CHUNK_SIZE = 5; // Small chunks for safe parallel PRs
    const chunks: string[][] = [];
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        chunks.push(files.slice(i, i + CHUNK_SIZE));
    }

    const tasksDir = join(repoRoot, '.agents', 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    const epicSlug = `refactor-${String(Date.now())}`;

    chunks.forEach((chunk, index) => {
        const taskSlug = `${epicSlug}-chunk-${String(index + 1)}`;
        const taskPath = join(tasksDir, `${taskSlug}.md`);
        
        const relativeFiles = chunk.map(f => f.replace(`${repoRoot}/`, ''));
        
        const template = `# Refactor Chunk ${String(index + 1)}

## Metadata

- Slug: ${taskSlug}
- Parent: ${epicSlug}
- Type: refactor

---

## Objective

${goal}

Apply this refactoring ONLY to the following files:
${relativeFiles.map(f => `- ${f}`).join('\n')}

## Progress checklist

- [ ] Refactor applied
- [ ] Tests passing
- [ ] \`swarm validate\` passing

## Next steps
- Read the files, apply the refactor, and generate a PR.
`;
        writeFileSync(taskPath, template, 'utf8');
        console.log(green(`  ✓ Created task `) + dim(taskSlug) + dim(` (${String(chunk.length)} files)`));
    });

    console.log(cyan(`\nRefactor split into ${String(chunks.length)} tasks. Ready for worker agents.`));
    console.log(dim(`Use 'swarm new <slug>' to start processing.`));
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
