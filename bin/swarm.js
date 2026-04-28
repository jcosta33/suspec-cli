#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const nodeVersion = process.versions.node;
const [major, minor, patch] = nodeVersion.split('.').map(Number);
const requiredMajor = 22;
const requiredMinor = 6;
if (major < requiredMajor || (major === requiredMajor && minor < requiredMinor)) {
    console.error(`Error: Swarm CLI requires Node.js >= ${requiredMajor}.${requiredMinor}.0`);
    console.error(`Current version: ${nodeVersion}`);
    process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = join(__dirname, '../src/index.ts');
const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', scriptPath, ...process.argv.slice(2)],
    {
        stdio: 'inherit',
    }
);

// Forward signal terminations so the parent exits the same way the child did.
if (res.signal) {
    process.kill(process.pid, res.signal);
} else {
    process.exit(res.status ?? 1);
}
