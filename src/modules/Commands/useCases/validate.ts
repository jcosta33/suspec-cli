#!/usr/bin/env node

import {
    bold,
    cyan,
    green,
    load_config,
    red,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { spawnSync } from 'child_process';
import { split_command } from '../../Terminal/useCases/index.ts';

const MAX_LINES_PER_COMMAND = 50;

function run_and_truncate(commandStr: string, cwd: string): boolean | null {
    if (!commandStr) return null;

    const { program, args } = split_command(commandStr);

    console.log(`\n${bold(cyan('>'))} ${commandStr}`);

    const result = spawnSync(program, args, {
        cwd,
        encoding: 'utf8',
        shell: false,
    });

    const success = result.status === 0;
    const rawOutput = result.stdout + result.stderr;
    let outputLines = rawOutput.split('\n');

    if (outputLines.length > MAX_LINES_PER_COMMAND) {
        const truncatedCount = outputLines.length - MAX_LINES_PER_COMMAND;
        outputLines = outputLines.slice(0, MAX_LINES_PER_COMMAND);
        outputLines.push('');
        outputLines.push(
            yellow(
                `... (truncated ${truncatedCount.toString()} lines of output for brevity)`
            )
        );
        outputLines.push(
            yellow(
                `Run '${commandStr}' manually in your terminal if you need the full output.`
            )
        );
    }

    const output = outputLines.join('\n').trim();
    if (output) {
        console.log(output);
    }

    if (success) {
        console.log(green('✓ Success'));
    } else {
        console.log(red(`✗ Failed (exit code: ${result.status?.toString() ?? 'unknown'})`));
    }

    return success;
}

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const config = load_config(repoRoot);
    const cmds = config.commands ?? {};

    let allPassed = true;

    if (cmds.validateDeps) {
        const passed = run_and_truncate(cmds.validateDeps, process.cwd());
        if (passed === false) allPassed = false;
    }

    if (cmds.typecheck) {
        const passed = run_and_truncate(cmds.typecheck, process.cwd());
        if (passed === false) allPassed = false;
    }

    if (!allPassed) {
        console.log(
            `\n${bold(red('Validation failed.'))} Please fix the errors above.`
        );
        return 1;
    }

    console.log(
        `\n${bold(green('All validations passed cleanly!'))}`
    );
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        process.exitCode = run();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(`Unexpected error: ${message}`));
        process.exitCode = 1;
    }
}
