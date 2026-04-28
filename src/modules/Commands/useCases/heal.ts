#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spinner } from '@clack/prompts';
import { red, cyan, bold, dim, green, yellow } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

const newCommandPath = join(dirname(fileURLToPath(import.meta.url)), 'new.ts');

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    console.log(cyan(`\nChecking branch health...`));

    const s = spinner();
    s.start('Running pnpm typecheck...');
    const typecheck = spawnSync('pnpm', ['typecheck'], { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' });

    if (typecheck.status === 0) {
        s.stop(green(`✓ Branch is healthy. No healing required.`));
        return 0;
    }

    s.stop(red(`✗ Branch is broken (typecheck failed)!`));
    console.log(dim(`Triggering Self-Healing Protocol...`));

    const slug = `heal-${String(Date.now())}`;
    const s2 = spinner();
    s2.start(yellow(`Spawning emergency hotfix agent: ${bold(slug)}...`));

    const res = spawnSync(process.execPath, ['--experimental-strip-types', newCommandPath, slug, '--title', 'Emergency Typecheck Fix', '--type', 'fix'], {
        cwd: repoRoot,
        stdio: 'pipe'
    });

    if (res.status === 0) {
        s2.stop(green(`✓ Heal agent spawned successfully.`));
        console.log(dim(`The agent should now fix the type errors and run \`swarm pr\`.`));
        return 0;
    } else {
        s2.stop(red(`✗ Failed to spawn heal agent.`));
        return 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
