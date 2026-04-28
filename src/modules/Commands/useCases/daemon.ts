#!/usr/bin/env node

import { watch, statSync, readdirSync, type FSWatcher, existsSync } from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, relative } from 'path';
import { parse_args, red, cyan, dim, yellow } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

const TEST_RADIUS_PATH = join(dirname(fileURLToPath(import.meta.url)), 'test-radius.ts');

function watchRecursive(targetDir: string, onEvent: (eventType: string, fullPath: string) => void): () => void {
    const watchers = new Map<string, FSWatcher>();

    function attach(dir: string) {
        if (watchers.has(dir)) return;
        try {
            const w = watch(dir, (eventType, filename) => {
                if (filename) {
                    const fullPath = join(dir, filename);
                    try {
                        const stat = statSync(fullPath);
                        if (stat.isDirectory() && !watchers.has(fullPath)) {
                            attach(fullPath);
                        }
                    } catch {
                        // file might be deleted
                        if (watchers.has(fullPath)) {
                            watchers.get(fullPath)!.close();
                            watchers.delete(fullPath);
                        }
                    }
                    onEvent(eventType, fullPath);
                }
            });
            watchers.set(dir, w);

            // Recursively attach
            const entries = readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    attach(join(dir, entry.name));
                }
            }
        } catch (_err) {
            // ignore permission errors
        }
    }

    attach(targetDir);

    return () => {
        for (const w of watchers.values()) {
            w.close();
        }
        watchers.clear();
    };
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const watchDirName = positional[0] || 'src';
    const targetDir = join(repoRoot, watchDirName);

    if (!existsSync(targetDir)) {
        console.error(red(`Error: Watch directory "${watchDirName}" does not exist.`));
        return 1;
    }

    console.log(cyan(`\nStarting Swarm Daemon (Background Watcher)...\n`));
    console.log(dim(`Watching ${watchDirName}/ for changes to trigger automated test-radius...`));
    console.log(dim('Press Ctrl+C to stop.\n'));

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let activeProcess: ReturnType<typeof spawn> | null = null;

    const closeWatcher = watchRecursive(targetDir, (_eventType, fullPath) => {
        if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
            return;
        }
        if (fullPath.endsWith('.spec.ts') || fullPath.endsWith('.spec.tsx')) {
            return;
        }

        if (timeout) {
            clearTimeout(timeout);
        }

        // Debounce saves
        timeout = setTimeout(() => {
            const relPath = relative(repoRoot, fullPath);
            console.log(yellow(`\n[Daemon] Detected change in ${relPath}`));

            if (activeProcess) {
                console.log(dim(`Killing previous test run...`));
                activeProcess.kill();
            }

            console.log(cyan(`Running blast radius check...`));
            activeProcess = spawn(
                process.execPath,
                ['--experimental-strip-types', TEST_RADIUS_PATH, relPath],
                { cwd: repoRoot, stdio: 'inherit' }
            );

            activeProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(dim(`[Daemon] Radius check passed.`));
                } else if (code !== null) {
                    console.log(red(`[Daemon] Radius check FAILED.`));
                }
                activeProcess = null;
            });
        }, 1000);
    });

    const shutdown = () => {
        closeWatcher();
        if (timeout) {
            clearTimeout(timeout);
        }
        if (activeProcess) {
            activeProcess.kill();
        }
        console.log(dim('\n[Daemon] Stopped.'));
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
