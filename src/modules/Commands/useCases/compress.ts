#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function skeletonize(content: string) {
    const lines = content.split('\n');
    const skeleton = [];
    let inDocBlock = false;

    for (const line of lines) {
        const trimmed = line.trim();
        
        // Keep JSDoc
        if (trimmed.startsWith('/**')) inDocBlock = true;
        if (inDocBlock) {
            skeleton.push(line);
            if (trimmed.endsWith('*/')) inDocBlock = false;
            continue;
        }

        // Keep top level signatures (imports, exports, types, interfaces, classes, function decls)
        // We do this naively by checking if the line starts with these keywords (ignoring exact brace matching for this Phase 1 tool).
        if (
            line.startsWith('import ') ||
            line.startsWith('export ') ||
            line.startsWith('interface ') ||
            line.startsWith('type ') ||
            line.startsWith('class ') ||
            line.startsWith('function ') ||
            line.startsWith('const ') ||
            line.startsWith('let ')
        ) {
            // If it's a one-liner or starts a block, keep it. If it ends with {, add it and we'll ignore the inner.
            skeleton.push(line);
            continue;
        }

        // Keep closing braces at the root level to maintain structural readability
        if (line === '}' || line === '};') {
            skeleton.push(line);
        }
    }

    return skeleton.join('\n');
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
        console.log(red('Usage: swarm compress <path/to/file.ts>'));
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
    const originalLines = content.split('\n').length;
    
    const compressed = skeletonize(content);
    const compressedLines = compressed.split('\n').length;

    console.log(cyan(`\nCompressed ${bold(targetFile)} (from ${String(originalLines)} to ${String(compressedLines)} lines):\n`));
    console.log(dim('--- SKELETON START ---'));
    console.log(compressed);
    console.log(dim('--- SKELETON END ---\n'));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
