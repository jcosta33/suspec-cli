#!/usr/bin/env node

// The dispatcher (AC-004/014). A thin in-process router over the M1 command surface — no agent
// fallback, no telemetry/registry bootstrap, no model loop. `swarm` with no command opens the
// dashboard (TTY) or prints help (piped); `swarm <cmd>` routes to its command; an unknown command
// prints to stderr and exits 2. The advertised set equals the dispatchable set by construction
// (see the AC-004 parity test).

import { run as run_check } from './modules/Commands/useCases/check.ts';
import { run as run_worktree } from './modules/Commands/useCases/worktree.ts';
import { run as run_status } from './modules/Commands/useCases/status.ts';
import { run as run_new } from './modules/Commands/useCases/new.ts';
import { run as run_init } from './modules/Commands/useCases/init.ts';
import { print_help } from './modules/Commands/useCases/help.ts';
import { run_dashboard_flow, create_clack_prompter } from './modules/Tui/useCases/index.ts';

type CommandRun = (argv: string[], cwd?: string) => Promise<number>;

const COMMANDS: Record<string, CommandRun> = {
    check: run_check,
    worktree: run_worktree,
    status: run_status,
    new: run_new,
    init: run_init,
};

// The dispatchable command names (excluding `help`, handled inline) — the AC-004 parity test
// cross-checks these against COMMAND_CATALOG.
export const COMMAND_NAMES = Object.keys(COMMANDS);

export async function dispatch(argv: string[], cwd: string = process.cwd()): Promise<number> {
    if (argv.length === 0) {
        /* v8 ignore start -- the no-args dashboard is the interactive shell; the dashboard flow logic is tested via the mock Prompter */
        if (process.stdout.isTTY === true) {
            return run_dashboard_flow(create_clack_prompter(), { cwd });
        }
        /* v8 ignore stop */
        print_help();
        return 0;
    }

    const command = argv[0];
    if (command === '--help' || command === '-h' || command === 'help') {
        print_help();
        return 0;
    }

    const run = COMMANDS[command];
    if (run === undefined) {
        process.stderr.write(`Unknown command: ${command}\nRun 'swarm --help' to see the commands.\n`);
        return 2;
    }
    return run(argv.slice(1), cwd);
}

/* v8 ignore start -- the process entry; dispatch() is unit-tested directly */
if (import.meta.url === `file://${process.argv[1]}`) {
    void dispatch(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    });
}
/* v8 ignore stop */
