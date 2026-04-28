#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { red, cyan, dim, green, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional, flags } = parse_args(process.argv.slice(2));
    const command = positional[0];
    
    const envFile = join(repoRoot, '.env.local');

    console.log(cyan(`\nConfiguring Chaos Monkey Environment...\n`));

    if (command === 'start') {
        const delay = String(flags.get('delay') ?? '2000');
        const failRate = String(flags.get('fail-rate') ?? '0.2');
        
        let envContent = '';
        if (existsSync(envFile)) envContent = readFileSync(envFile, 'utf8');

        // Remove old chaos variables
        envContent = envContent.split('\n').filter(l => !l.startsWith('VITE_CHAOS_')).join('\n');
        
        envContent += `\nVITE_CHAOS_LATENCY=${delay}\nVITE_CHAOS_FAIL_RATE=${failRate}\n`;
        writeFileSync(envFile, `${envContent.trim()}\n`, 'utf8');
        
        console.log(yellow(`⚠ Chaos Monkey INJECTED.`));
        console.log(dim(`- Latency: ${delay}ms`));
        console.log(dim(`- Failure Rate: ${String(parseFloat(failRate) * 100)}%`));
        console.log(dim(`All \`fetch\` wrappers will now randomly drop and delay requests.`));
        
    } else if (command === 'stop') {
        if (existsSync(envFile)) {
            let envContent = readFileSync(envFile, 'utf8');
            envContent = envContent.split('\n').filter(l => !l.startsWith('VITE_CHAOS_')).join('\n');
            writeFileSync(envFile, `${envContent.trim()}\n`, 'utf8');
        }
        console.log(green(`✓ Chaos Monkey STOPPED.`));
        console.log(dim(`Development environment returned to normal.`));
    } else {
        console.log(red('Usage: swarm chaos <start|stop> [--delay 2000] [--fail-rate 0.2]'));
        return 1;
    }
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
