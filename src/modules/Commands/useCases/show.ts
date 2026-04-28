#!/usr/bin/env node

import {
    box,
    dim,
    green,
    parse_args,
    red,
    fzf_select,
    yellow,
    format_markdown,
} from '../../Terminal/useCases/index.ts';
import { is_process_running, read_state } from '../../AgentState/useCases/index.ts';
import { get_repo_root, is_worktree_dirty, get_status_summary, worktree_list } from '../../Workspace/useCases/index.ts';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    let slug = positional[0];

    if (!slug) {
        const sandboxes = worktree_list(repoRoot);
        const items = sandboxes.map((w) => w.branch?.replace('agent/', '')).filter((s): s is string => !!s);
        if (items.length === 0) {
            console.log(yellow('No active sandboxes.'));
            return 1;
        }
        try {
            const selected = fzf_select(items);
            if (!selected) {
                console.log(red('No selection made.'));
                return 1;
            }
            slug = Array.isArray(selected) ? selected[0] : selected;
        } catch (e: unknown) {
            console.log(red('Usage: swarm show <slug>'));
            const message = e instanceof Error ? e.message : String(e);
            console.log(yellow(`(Fuzzy search failed: ${message})`));
            return 1;
        }
    }

    const sandboxes = worktree_list(repoRoot);
    const globalState = read_state(repoRoot);
    const match = sandboxes.find((w) => w.branch === `agent/${slug}`);

    if (!match) {
        console.error(red(`No sandbox found for slug "${slug}".`));
        return 1;
    }

    const state = globalState[slug] ?? {};

    const dirty = is_worktree_dirty(match.path);
    const gitStatus = get_status_summary(match.path);

    const lines = [
        `  Branch:    ${match.branch ?? 'unknown'}`,
        `  Path:      ${match.path}`,
        `  HEAD:      ${match.head ?? 'unknown'}`,
        `  Status:    ${state.status ?? dim('idle')}`,
        `  Git:       ${gitStatus}${dirty ? red(' ⚠ uncommitted changes') : ''}`,
    ];
    if (state.backend) lines.push(`  Backend:   ${state.backend}`);
    if (state.agent) lines.push(`  Agent:     ${state.agent}`);
    if (state.pid) {
        const alive = is_process_running(state.pid);
        lines.push(`  PID:       ${state.pid.toString()} ${alive ? green('(alive)') : red('(dead)')}`);
    }
    if (state.lastUpdated) lines.push(`  Updated:   ${state.lastUpdated}`);

    box(`Sandbox Details: ${slug}`, lines);

    const taskPath = join(match.path, '.agents', 'tasks', `${slug}.md`);
    if (existsSync(taskPath)) {
        console.log('');
        const content = readFileSync(taskPath, 'utf8');
        console.log(format_markdown(content));
    }

    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
