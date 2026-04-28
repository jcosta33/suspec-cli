#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function extractImports(content: string) {
    const lines = content.split('\n');
    const dependencies = [];

    for (const line of lines) {
        // Match `import ... from '...'` or `import '...'`
        const match = /import\s+.*?from\s+['"](.*?)['"]/.exec(line);
        const matchBare = /import\s+['"](.*?)['"]/.exec(line);
        
        if (match) {
            dependencies.push(match[1]);
        } else if (matchBare) {
            dependencies.push(matchBare[1]);
        }
    }
    return [...new Set(dependencies)]; // unique
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
    const targetFile = positional[0];
    
    if (!targetFile) {
        console.log(red('Usage: swarm graph <path/to/file.ts>'));
        return 1;
    }

    const resolved = resolve_within(repoRoot, targetFile);
    if (!resolved.ok) {
        console.error(red(resolved.error.message));
        return 1;
    }
    const fullPath = resolved.value;
    if (!existsSync(fullPath)) {
        console.error(red(`File not found: ${targetFile}`));
        return 1;
    }

    const content = readFileSync(fullPath, 'utf8');
    const deps = extractImports(content);

    console.log(cyan(`\nDependency Graph for ${bold(targetFile)}:\n`));
    
    if (deps.length === 0) {
        console.log(dim('  (No internal/external dependencies found)'));
    } else {
        deps.forEach(dep => {
            // Highlight external packages vs relative imports
            if (dep.startsWith('.') || dep.startsWith('src/')) {
                console.log(`  ├─ ${bold(dep)}`);
            } else {
                console.log(`  ├─ ${yellow(dep)} ${dim('(external)')}`);
            }
        });
    }
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
