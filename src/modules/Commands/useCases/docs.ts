#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function extractDocs(content: string) {
    const lines = content.split('\n');
    const docs = [];
    let inDocBlock = false;
    let currentBlock = [];

    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('/**')) {
            inDocBlock = true;
            currentBlock = [];
        }
        
        if (inDocBlock) {
            currentBlock.push(line);
            if (trimmed.endsWith('*/')) {
                inDocBlock = false;
                docs.push(currentBlock.join('\n'));
            }
        }
    }

    return docs;
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
        console.log(red('Usage: swarm docs <path/to/file.ts>'));
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
    const docs = extractDocs(content);

    console.log(cyan(`\nExtracted Documentation for ${bold(targetFile)}:\n`));
    
    if (docs.length === 0) {
        console.log(dim('  (No JSDoc blocks found in this file)'));
    } else {
        docs.forEach(block => {
            console.log(`${green(block)}\n`);
        });
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
