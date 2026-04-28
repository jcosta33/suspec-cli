#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { red, cyan, bold, dim, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    // Determine current agent slug from the path or environment
    // For simplicity in the script, we expect `--from <slug>` or we read it from worktree name
    const worktreeName = repoRoot.split('/').pop() ?? '';
    let mySlug = 'host';
    if (worktreeName.startsWith('agent-')) {
        mySlug = worktreeName.replace('agent-', '');
    } else if (worktreeName.startsWith('agents-')) {
        mySlug = worktreeName.replace('agents-', '');
    }

    const { positional, flags } = parse_args(process.argv.slice(2));
    const targetSlug = positional[0];
    const message = flags.get('message') ?? flags.get('m');
    
    if (flags.get('from')) {
        mySlug = String(flags.get('from'));
    }

    if (!targetSlug) {
        console.log(red('Usage: swarm chat <target-slug> [--message "your message"]'));
        return 1;
    }

    const ipcDir = join(repoRoot, '.agents', 'ipc'); // put it in the host repo
    if (!existsSync(ipcDir)) mkdirSync(ipcDir, { recursive: true });

    // Consistent filename regardless of who started it
    const participants = [mySlug, targetSlug].sort();
    const chatFile = join(ipcDir, `${participants[0]}-${participants[1]}.md`);

    if (message) {
        // Send mode
        const timestamp = new Date().toISOString();
        const entryText = `\n### [${timestamp}] **${mySlug}**:\n${String(message)}\n`;
        appendFileSync(chatFile, entryText, 'utf8');
        console.log(cyan(`Message sent to ${bold(targetSlug)}.`));
    } else {
        // Read mode
        if (!existsSync(chatFile)) {
            console.log(yellow(`No active IPC channel between ${mySlug} and ${targetSlug}.`));
            return 0;
        }
        console.log(cyan(`\n--- IPC Log: ${bold(participants[0])} <-> ${bold(participants[1])} ---\n`));
        console.log(readFileSync(chatFile, 'utf8'));
        console.log(dim('--- End of Log ---\n'));
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
