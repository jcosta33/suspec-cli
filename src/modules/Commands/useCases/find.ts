#!/usr/bin/env node

import { bold, cyan, dim, green, parse_args, red, yellow } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { spawnSync } from 'child_process';

export function escape_regex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const queryType = positional[0];
    const queryTarget = positional[1];

    if (!queryType || !queryTarget) {
        console.log(red('Usage: swarm find <type> <target>'));
        console.log(dim('Types: class, interface, function, implements, extends'));
        console.log(dim('Example: swarm find implements TransportHandler'));
        return 1;
    }

    console.log(cyan(`\nSemantic Search: ${bold(queryType)} ${bold(queryTarget)}...\n`));

    const target = escape_regex(queryTarget);
    let regex: string;
    switch (queryType) {
        case 'class':
            regex = `class\\s+${target}\\b`;
            break;
        case 'interface':
            regex = `interface\\s+${target}\\b`;
            break;
        case 'function':
            regex = `function\\s+${target}\\b|const\\s+${target}\\s*=\\s*(\\(|async)`;
            break;
        case 'implements':
            regex = `class\\s+\\w+\\s+(implements|extends).*?\\b${target}\\b`;
            break;
        case 'extends':
            regex = `(class|interface)\\s+\\w+\\s+extends.*?\\b${target}\\b`;
            break;
        default:
            console.error(red(`Unknown query type: ${queryType}`));
            return 1;
    }

    const res = spawnSync('git', ['grep', '-n', '-E', regex], { cwd: repoRoot, encoding: 'utf8' });

    if (res.status === 0 && res.stdout.trim()) {
        const lines = res.stdout.trim().split('\n');
        console.log(green(`✓ Found ${String(lines.length)} match(es):`));
        lines.forEach((line) => {
            const parts = line.split(':');
            const file = parts.shift();
            const lineNum = parts.shift();
            const content = parts.join(':');
            console.log(`  ${cyan(String(file))}:${yellow(String(lineNum))} ${dim(content.trim())}`);
        });
    } else {
        console.log(dim(`No matches found.`));
    }

    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
