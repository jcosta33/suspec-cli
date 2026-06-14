#!/usr/bin/env node

// `swarm help` / `swarm --help` — the command reference, driven by COMMAND_CATALOG so it always
// lists exactly the dispatchable surface (AC-004). Plain stdout (scriptable), coloured for humans.

import color from 'picocolors';

import { COMMAND_CATALOG } from './catalog.ts';

export function print_help(): void {
    const commands = COMMAND_CATALOG.map((entry) => `  ${entry.name.padEnd(9)} ${color.dim(entry.description)}`);
    const lines = [
        `${color.bold('swarm')} — a reconcile-only harness for spec-driven agent work`,
        '',
        color.bold('Usage'),
        '  swarm                    open the interactive dashboard',
        '  swarm <command> [args]   run a command directly',
        '  swarm <command> -i       run a command interactively',
        '',
        color.bold('Commands'),
        ...commands,
        '',
        color.dim('  Run `swarm <command> --help` for a command’s usage and flags.'),
        '',
        color.bold('Global flags'),
        `  --json                   machine-readable output (never prompts)`,
        `  --no-workspace           run without a Swarm workspace where possible`,
        `  --version · -v           print the version`,
        '',
        color.dim('Exit codes: 0 clean · 1 warnings · 2 error.'),
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
}

// `swarm <command> --help` — the usage block for one command, from the same catalog.
export function print_command_help(name: string): void {
    const entry = COMMAND_CATALOG.find((command) => command.name === name);
    if (entry === undefined) {
        print_help();
        return;
    }
    const lines = [
        `${color.bold(`swarm ${entry.name}`)} — ${entry.description}`,
        '',
        color.bold('Usage'),
        ...entry.usage.map((line) => `  ${line}`),
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
}

/* v8 ignore start -- the script entry runs when spawned directly, not as a unit */
if (import.meta.url === `file://${process.argv[1]}`) {
    print_help();
}
/* v8 ignore stop */
