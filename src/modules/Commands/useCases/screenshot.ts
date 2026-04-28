#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { join } from 'path';
import { red, green, cyan, bold, dim, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { existsSync, mkdirSync } from 'fs';

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const url = positional[0] || 'http://localhost:3000';
    
    const screenshotsDir = join(repoRoot, '.agents', 'screenshots');
    if (!existsSync(screenshotsDir)) {
        mkdirSync(screenshotsDir, { recursive: true });
    }

    const fileName = `capture-${String(Date.now())}.png`;
    const outputPath = join(screenshotsDir, fileName);

    console.log(cyan(`\nCapturing screenshot of ${bold(url)}...`));
    console.log(dim(`Using Playwright via npx (this may take a moment on first run)...`));

    // Run playwright screenshot tool natively via npx so we don't have to pollute package.json dependencies
    const res = spawnSync('npx', ['playwright', 'screenshot', url, outputPath], { stdio: 'inherit' });

    if (res.status === 0) {
        console.log(green(`\n✓ Screenshot saved to: ${outputPath}`));
        console.log(`(You can now pass this path to the LLM for visual validation against the UI spec)`);
    } else {
        console.log(red(`\n✗ Screenshot capture failed.`));
    }
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
