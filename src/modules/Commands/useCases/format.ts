#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { red, cyan, bold, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

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
        console.log(red('Usage: swarm format <path/to/file.ts>'));
        return 1;
    }

    console.log(cyan(`\nFormatting ${bold(targetFile)}...`));

    const res = spawnSync('npx', ['prettier', '--write', targetFile], { cwd: repoRoot, stdio: 'inherit' });

    if (res.status === 0) {
        console.log(green(`✓ File formatted successfully.\n`));
    } else {
        console.log(red(`✗ Formatting failed.\n`));
        return 1;
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
