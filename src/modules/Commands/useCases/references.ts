#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { red, cyan, bold, dim, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional, flags } = parse_args(process.argv.slice(2));
    const symbol = positional[0];
    const pathFilter = String(flags.get('path') ?? 'src'); // defaults to src
    
    if (!symbol) {
        console.log(red('Usage: swarm references <symbol> [--path <dir>]'));
        return 1;
    }

    const pathCheck = resolve_within(repoRoot, pathFilter);
    if (!pathCheck.ok) {
        console.error(red(pathCheck.error.message));
        return 1;
    }

    console.log(cyan(`\nScanning for references to ${bold(symbol)} in ${bold(pathFilter)}...\n`));

    // Use git grep for lightning fast indexed search.
    // Pass the original (relative) pathFilter — git interprets it relative to cwd.
    const res = spawnSync('git', ['grep', '-n', symbol, '--', pathFilter], { cwd: repoRoot, encoding: 'utf8' });

    if (res.status !== 0 || !res.stdout) {
        console.log(dim(`  No references found for "${symbol}".`));
        return 0;
    }

    const lines = res.stdout.split('\n').filter(Boolean);
    const MAX_RESULTS = 30;

    let displayed = 0;
    for (const line of lines) {
        if (displayed >= MAX_RESULTS) {
            console.log(dim(`\n  ... and ${String(lines.length - MAX_RESULTS)} more matches. Run manually to see all.`));
            break;
        }
        
        // Output format is usually: filePath:lineNumber:content
        const parts = line.split(':');
        if (parts.length >= 3) {
            const file = parts.shift();
            const lineNum = parts.shift();
            if (!file || !lineNum) continue;
            const text = parts.join(':').trim();
            console.log(`${bold(file)}:${cyan(lineNum)} ${dim(text)}`);
            displayed++;
        }
    }
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
