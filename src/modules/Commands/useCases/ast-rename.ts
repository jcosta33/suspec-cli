#!/usr/bin/env node

import {
    bold,
    cyan,
    green,
    parse_args,
    red,
} from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { rename_symbol } from '../../../utils/ast.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const filePath = positional[0];
    const oldName = positional[1];
    const newName = positional[2];

    if (!filePath || !oldName || !newName) {
        console.log(red('Usage: swarm ast-rename <path/to/file.ts> <OldName> <NewName>'));
        return 1;
    }

    console.log(cyan(`\nRenaming ${bold(oldName)} → ${bold(newName)} in ${filePath}...`));

    const result = rename_symbol(repoRoot, filePath, oldName, newName);

    if (result.success) {
        console.log(green(`✓ Rename completed successfully.\n`));
    } else {
        console.error(red(`✗ Rename failed: ${result.error ?? 'unknown error'}\n`));
        return 1;
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
