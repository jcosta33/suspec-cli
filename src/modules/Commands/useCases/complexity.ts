#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, yellow, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function calculateComplexity(content: string) {
    // Naive cyclomatic complexity heuristic
    let score = 1; // base score for the file
    
    const keywords = [
        /\bif\s*\(/g,
        /\belse\s+if\b/g,
        /\bfor\s*\(/g,
        /\bwhile\s*\(/g,
        /\bcase\b/g,
        /\bcatch\s*\(/g,
        /&&/g,
        /\|\|/g,
        /\?/g // ternary operator
    ];

    for (const regex of keywords) {
        const matches = content.match(regex);
        if (matches) {
            score += matches.length;
        }
    }

    return score;
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
        console.log(red('Usage: swarm complexity <path/to/file.ts>'));
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
    const score = calculateComplexity(content);

    console.log(cyan(`\nComplexity Analysis for ${bold(targetFile)}:`));
    console.log(dim('Heuristic cyclomatic score (lower is better):'));
    
    if (score < 10) {
        console.log(green(`Score: ${String(score)} - Excellent. Highly maintainable.`));
    } else if (score < 25) {
        console.log(yellow(`Score: ${String(score)} - Moderate. Keep an eye on nested logic.`));
    } else {
        console.log(red(`Score: ${String(score)} - High Complexity! Consider refactoring and splitting logic.`));
    }
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
