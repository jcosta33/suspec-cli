#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const sourceEntry = join(here, '../src/index.ts');
const builtEntry = join(here, '../dist/index.js');
const args = process.argv.slice(2);

let res;
if (existsSync(sourceEntry)) {
    // Dev checkout: run the TypeScript sources directly via Node's native type stripping — no build
    // step. Needs Node >= 22.6. A published install ships no src/, so it takes the built path below
    // (type stripping is unsupported under node_modules anyway).
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 6)) {
        console.error('Error: running corpus-cli from source needs Node.js >= 22.6 (or run `npm run build`).');
        console.error(`Current version: ${process.versions.node}`);
        process.exit(1);
    }
    res = spawnSync(
        process.execPath,
        ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', sourceEntry, ...args],
        { stdio: 'inherit' }
    );
} else {
    // Published install: run the bundled JavaScript — works anywhere, including under node_modules.
    res = spawnSync(process.execPath, [builtEntry, ...args], { stdio: 'inherit' });
}

// Forward signal terminations so the parent exits the same way the child did.
if (res.signal) {
    process.kill(process.pid, res.signal);
} else {
    process.exit(res.status ?? 1);
}
