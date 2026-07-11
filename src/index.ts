#!/usr/bin/env node

// The dispatcher. A thin in-process router over the single check verb (ADR-0143) — the CLI reads
// exactly the files it is handed and resolves nothing else. `suspec` with no command prints usage;
// `suspec check …` routes to the check command; an unknown command prints to stderr and exits 2.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { run_check, print_usage } from './modules/Commands/useCases/index.ts';

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

// Read the package version for `--version`. package.json sits one level above this module — true for
// both the dev entry (src/index.ts) and the built entry (dist/index.js).
function print_version(): void {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const raw: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const version = is_record(raw) && typeof raw.version === 'string' ? raw.version : 'unknown';
    process.stdout.write(`suspec ${version}\n`);
}

// A command returns an exit code. The dispatcher awaits uniformly so a future async command fits.
type CommandRun = (argv: string[], cwd?: string) => number | Promise<number>;

const COMMANDS: Record<string, CommandRun> = {
    check: run_check,
};

// The dispatchable command names (excluding `help`, handled inline).
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
        print_usage();
        return 0;
    }

    const command = argv[0];
    if (command === '--help' || command === '-h' || command === 'help') {
        print_usage();
        return 0;
    }
    if (command === '--version' || command === '-v') {
        print_version();
        return 0;
    }

    // Own-key lookup only: a bare bracket read walks the prototype chain, so an argv value like
    // `toString` would resolve to an Object.prototype member instead of the unknown-command path.
    const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
    if (run === undefined) {
        process.stderr.write(`Unknown command: ${command}\nRun 'suspec --help' to see the usage.\n`);
        return 2;
    }

    const rest = argv.slice(1);
    // Respect the `--` end-of-options marker parse_flags honors: a dash-leading positional after `--`
    // must not be read as a help request.
    const optionZone = rest.includes('--') ? rest.slice(0, rest.indexOf('--')) : rest;
    if (optionZone.includes('--help') || optionZone.includes('-h')) {
        print_usage();
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
            process.stderr.write(`suspec: ${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 2;
        }
    );
}
/* v8 ignore stop */
