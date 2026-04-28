#!/usr/bin/env node

import { parse_args, red, green, dim } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { claim_lock, list_locks, release_lock } from '../../AgentState/useCases/index.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { flags, positional } = parse_args(process.argv.slice(2));
    const subcommand = positional[0];

    if (!subcommand) {
        console.error(red('Usage: swarm lock <claim|release|list> [args]'));
        return 1;
    }

    if (subcommand === 'claim') {
        const files = positional.slice(1);
        const agentSlug = flags.get('agent') as string | undefined;

        if (files.length === 0) {
            console.error(red('Usage: swarm lock claim <file...> --agent <slug>'));
            return 1;
        }
        if (!agentSlug) {
            console.error(red('Usage: swarm lock claim <file...> --agent <slug>'));
            return 1;
        }

        const result = claim_lock(repoRoot, agentSlug, files);
        if (result.ok) {
            console.log(green(`Claimed ${String(files.length)} file(s) for ${agentSlug}.`));
            return 0;
        }
        console.error(red(result.error.message));
        return 1;
    }

    if (subcommand === 'release') {
        const file = positional[1];
        if (!file) {
            console.error(red('Usage: swarm lock release <file>'));
            return 1;
        }

        const result = release_lock(repoRoot, file);
        if (result.ok) {
            console.log(green(`Released lock on ${file}.`));
            return 0;
        }
        console.error(red(result.error.message));
        return 1;
    }

    if (subcommand === 'list') {
        const locks = list_locks(repoRoot);
        if (locks.length === 0) {
            console.log(dim('No active file locks.'));
            return 0;
        }

        console.log('Active file locks:\n');
        for (const lock of locks) {
            console.log(`  ${green(lock.files.join(', '))}`);
            console.log(`    Agent: ${lock.agent_slug}`);
            console.log(`    Claimed: ${lock.claimed_at}`);
            console.log(`    Expires: ${lock.expires_at}`);
            console.log();
        }
        return 0;
    }

    console.error(red(`Unknown subcommand: ${subcommand}. Use claim, release, or list.`));
    return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
