#!/usr/bin/env node

import { cyan, dim, green, red, yellow } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

type CommandCheck =
    | { ok: true; version: string }
    | { ok: false; error: string };

function check_command(cmd: string, args: string[]): CommandCheck {
    const res = spawnSync(cmd, args, { encoding: 'utf8' });
    if (res.status === 0) {
        return { ok: true, version: res.stdout.trim().split('\n')[0] };
    }
    return {
        ok: false,
        error: res.stderr || 'Command failed',
    };
}

export function run(): number {
    console.log(cyan('\n🩺 Swarm Health Check\n'));

    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
        console.log(green('✓ Git Workspace:'), dim(repoRoot));
    } catch (_e: unknown) {
        console.log(red('✗ Git Workspace:'), 'Not a git repository.');
        return 1;
    }

    const nodeCheck = check_command('node', ['-v']);
    if (nodeCheck.ok)
        console.log(green('✓ Node:'), dim(nodeCheck.version));
    else console.log(red('✗ Node:'), nodeCheck.error);

    const gitCheck = check_command('git', ['--version']);
    if (gitCheck.ok)
        console.log(green('✓ Git:'), dim(gitCheck.version));
    else console.log(red('✗ Git:'), gitCheck.error);

    const pnpmCheck = check_command('pnpm', ['-v']);
    if (pnpmCheck.ok)
        console.log(green('✓ PNPM:'), dim(pnpmCheck.version));
    else
        console.log(
            yellow('⚠ PNPM:'),
            'Not found, falling back to npm maybe?'
        );

    const agentsDir = join(repoRoot, '.agents');
    if (existsSync(agentsDir)) {
        console.log(
            green('✓ Swarm Storage:'),
            dim('.agents directory exists.')
        );
    } else {
        console.log(
            yellow('⚠ Swarm Storage:'),
            dim('.agents directory does not exist yet.')
        );
    }

    console.log(cyan('\nAll pre-flight checks complete.\n'));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
