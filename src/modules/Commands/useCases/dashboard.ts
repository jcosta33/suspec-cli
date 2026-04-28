#!/usr/bin/env node

import { confirm, intro, isCancel, log, note, outro, select, text } from '@clack/prompts';
import { spawnSync } from 'child_process';
import { read_state } from '../../AgentState/useCases/index.ts';
import { red } from '../../Terminal/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';

function get_command_path(cmd: string): string {
    return new URL(`./${cmd}.ts`, import.meta.url).pathname;
}

function spawn_command(cmd: string, args: string[], cwd: string): number {
    const res = spawnSync(
        process.execPath,
        ['--experimental-strip-types', get_command_path(cmd), ...args],
        { stdio: 'inherit', cwd }
    );
    if (res.signal) {
        process.kill(process.pid, res.signal);
        return 1;
    }
    return res.status ?? 1;
}

function get_agent_slugs(repoRoot: string): string[] {
    return worktree_list(repoRoot)
        .map((w) => w.branch?.replace('agent/', ''))
        .filter((s): s is string => !!s && s !== 'main');
}

function format_sandbox_list(repoRoot: string): string {
    const state = read_state(repoRoot);
    const sandboxes = worktree_list(repoRoot);

    if (sandboxes.length === 0) {
        return 'No sandboxes found.';
    }

    return sandboxes
        .map((w) => {
            const slug = w.branch?.replace('agent/', '') ?? 'main';
            const status = slug === 'main' ? 'IDLE' : (state[slug]?.status ?? 'unknown');
            return `${status.padEnd(10)} ${slug}`;
        })
        .join('\n');
}

async function prompt_return(): Promise<void> {
    await confirm({ message: 'Return to dashboard?' });
}

export async function run_dashboard(): Promise<number> {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        log.error(red('Error: Not inside a git repository. Run `swarm init` to set up.'));
        return 1;
    }

    for (;;) {
        console.clear();
        intro('🤖 Swarm Dashboard');

        note(format_sandbox_list(repoRoot), 'Active Sandboxes');

        const action = await select({
            message: 'What would you like to do?',
            options: [
                { value: 'new', label: 'New sandbox' },
                { value: 'open', label: 'Open sandbox' },
                { value: 'list', label: 'List sandboxes' },
                { value: 'show', label: 'Show details' },
                { value: 'status', label: 'Status of a sandbox' },
                { value: 'pr', label: 'Open PR for a sandbox' },
                { value: 'remove', label: 'Remove sandbox' },
                { value: 'validate', label: 'Validate codebase' },
                { value: 'test', label: 'Run tests' },
                { value: 'doctor', label: 'Diagnostics (doctor)' },
                { value: 'help', label: 'Help' },
                { value: 'exit', label: 'Exit' },
            ],
        });

        if (isCancel(action) || action === 'exit') {
            outro('Goodbye');
            return 0;
        }

        if (action === 'new') {
            const slug = await text({ message: 'Sandbox slug (e.g. billing-refactor):' });
            if (!slug || isCancel(slug)) {
                continue;
            }
            const title = await text({ message: 'Task title (optional):', placeholder: slug });
            const titleArg = !title || isCancel(title) ? [] : [title];
            spawn_command('new', [slug, ...titleArg], repoRoot);
            await prompt_return();
        } else if (action === 'open') {
            const slugs = get_agent_slugs(repoRoot);
            if (slugs.length === 0) {
                log.warn('No sandboxes to open.');
                await prompt_return();
                continue;
            }
            const slug = await select({
                message: 'Which sandbox?',
                options: slugs.map((s) => ({ value: s, label: s })),
            });
            if (!slug || isCancel(slug)) {
                continue;
            }
            spawn_command('open', [slug], repoRoot);
            await prompt_return();
        } else if (action === 'list') {
            spawn_command('list', [], repoRoot);
            await prompt_return();
        } else if (action === 'show') {
            const slugs = get_agent_slugs(repoRoot);
            if (slugs.length === 0) {
                log.warn('No sandboxes to show.');
                await prompt_return();
                continue;
            }
            const slug = await select({
                message: 'Which sandbox?',
                options: slugs.map((s) => ({ value: s, label: s })),
            });
            if (!slug || isCancel(slug)) {
                continue;
            }
            spawn_command('show', [slug], repoRoot);
            await prompt_return();
        } else if (action === 'remove') {
            const slugs = get_agent_slugs(repoRoot);
            if (slugs.length === 0) {
                log.warn('No sandboxes to remove.');
                await prompt_return();
                continue;
            }
            const slug = await select({
                message: 'Which sandbox?',
                options: slugs.map((s) => ({ value: s, label: s })),
            });
            if (!slug || isCancel(slug)) {
                continue;
            }
            const shouldForce = await confirm({
                message: `Force remove ${slug}? This is destructive.`,
            });
            if (!shouldForce || isCancel(shouldForce)) {
                continue;
            }
            spawn_command('remove', [slug, '--force'], repoRoot);
            await prompt_return();
        } else if (action === 'status') {
            const slugs = get_agent_slugs(repoRoot);
            if (slugs.length === 0) {
                log.warn('No sandboxes.');
                await prompt_return();
                continue;
            }
            const slug = await select({
                message: 'Which sandbox?',
                options: slugs.map((s) => ({ value: s, label: s })),
            });
            if (!slug || isCancel(slug)) {
                continue;
            }
            spawn_command('status', [slug], repoRoot);
            await prompt_return();
        } else if (action === 'pr') {
            const slugs = get_agent_slugs(repoRoot);
            if (slugs.length === 0) {
                log.warn('No sandboxes.');
                await prompt_return();
                continue;
            }
            const slug = await select({
                message: 'Which sandbox?',
                options: slugs.map((s) => ({ value: s, label: s })),
            });
            if (!slug || isCancel(slug)) {
                continue;
            }
            spawn_command('pr', [slug], repoRoot);
            await prompt_return();
        } else if (action === 'validate') {
            spawn_command('validate', [], repoRoot);
            await prompt_return();
        } else if (action === 'test') {
            spawn_command('test', [], repoRoot);
            await prompt_return();
        } else if (action === 'doctor') {
            spawn_command('doctor', [], repoRoot);
            await prompt_return();
        } else {
            spawn_command('help', [], repoRoot);
            await prompt_return();
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void run_dashboard().then((code) => {
        process.exitCode = code;
    });
}
