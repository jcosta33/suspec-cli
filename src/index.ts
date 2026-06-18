#!/usr/bin/env node

// The dispatcher (AC-004/014). A thin in-process router over the M1 command surface — no agent
// fallback, no telemetry/registry bootstrap, no model loop. `swarm` with no command opens the
// dashboard (TTY) or prints help (piped); `swarm <cmd>` routes to its command; an unknown command
// prints to stderr and exits 2. The advertised set equals the dispatchable set by construction
// (see the AC-004 parity test).

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import {
    run_check,
    run_worktree,
    run_status,
    run_review,
    run_new,
    run_init,
    run_pull,
    run_promote,
    print_help,
    print_command_help,
} from './modules/Commands/useCases/index.ts';
import { run_dashboard_flow, create_clack_prompter } from './modules/Tui/useCases/index.ts';

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

// Read the package version for `--version`. package.json sits one level above this module — true for
// both the dev entry (src/index.ts) and the built entry (dist/index.js).
function print_version(): void {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const raw: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const version = is_record(raw) && typeof raw.version === 'string' ? raw.version : 'unknown';
    process.stdout.write(`swarm ${version}\n`);
}

// A command returns an exit code — synchronously (`status`, which only renders) or asynchronously
// (the commands whose `-i` flow awaits prompts). The dispatcher awaits uniformly, so both fit.
type CommandRun = (argv: string[], cwd?: string) => number | Promise<number>;

const COMMANDS: Record<string, CommandRun> = {
    check: run_check,
    worktree: run_worktree,
    status: run_status,
    review: run_review,
    new: run_new,
    init: run_init,
    pull: run_pull,
    promote: run_promote,
};

// The dispatchable command names (excluding `help`, handled inline) — the AC-004 parity test
// cross-checks these against COMMAND_CATALOG.
export const COMMAND_NAMES = Object.keys(COMMANDS);

// Is this module the process entry? Compare URL-to-URL: `import.meta.url` percent-encodes the path
// (a space becomes `%20`), so building `file://${argv[1]}` by hand never matches under an install
// path with a space/non-ASCII char — silently turning the CLI into a no-op. pathToFileURL encodes
// the same way, so the comparison holds.
export function is_main_module(metaUrl: string, entry: string | undefined): boolean {
    return entry !== undefined && metaUrl === pathToFileURL(entry).href;
}

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
    if (command === '--version' || command === '-v') {
        print_version();
        return 0;
    }

    const run = COMMANDS[command];
    if (run === undefined) {
        process.stderr.write(`Unknown command: ${command}\nRun 'swarm --help' to see the commands.\n`);
        return 2;
    }

    const rest = argv.slice(1);
    if (rest.includes('--help') || rest.includes('-h')) {
        print_command_help(command);
        return 0;
    }
    return run(rest, cwd);
}

/* v8 ignore start -- the process entry; dispatch() + is_main_module are unit-tested directly */
if (is_main_module(import.meta.url, process.argv[1])) {
    void dispatch(process.argv.slice(2)).then(
        (code) => {
            process.exitCode = code;
        },
        (error: unknown) => {
            // Defense in depth: any uncaught error becomes a clean message + exit 2, never a stack trace.
            process.stderr.write(`swarm: ${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 2;
        }
    );
}
/* v8 ignore stop */
