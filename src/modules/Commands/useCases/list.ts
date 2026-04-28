#!/usr/bin/env node

import {
    bold,
    cyan,
    dim,
    green,
    logger,
    red,
    warn,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { is_process_running, read_state } from '../../AgentState/useCases/index.ts';
import { get_repo_root, list_branches_by_prefix, worktree_list } from '../../Workspace/useCases/index.ts';

function format_status(state: { status?: string; pid?: number; backend?: string }) {
    if (!state.status) return dim('[IDLE]');
    if (state.status === 'running') {
        if (state.pid) {
            return is_process_running(state.pid)
                ? green('[RUNNING]')
                : red('[CRASHED]');
        }
        return green('[LAUNCHED]');
    }
    return yellow(`[${state.status.toUpperCase()}]`);
}

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        logger.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const sandboxes = worktree_list(repoRoot);
    const globalState = read_state(repoRoot);
    const allBranches = list_branches_by_prefix('agent/', repoRoot);

    logger.raw(cyan('\n👾 Swarm Sandboxes\n'));

    if (sandboxes.length === 0 && allBranches.length === 0) {
        logger.info(dim('No active sandboxes found.'));
        return 0;
    }

    sandboxes.forEach((s) => {
        const slug = s.branch?.replace('agent/', '') ?? 'unknown';
        const state = globalState[slug] ?? {};
        const statusTag = format_status(state);
        const backend = state.backend ? dim(` via ${state.backend}`) : '';
        const pid = state.pid ? dim(` (PID: ${state.pid.toString()})`) : '';

        logger.raw(
            `  ${statusTag.padEnd(20)} ${bold(slug)} ${pid}${backend}`
        );
        logger.raw(`  ${dim('↳')} Branch: ${s.branch ?? 'unknown'}  Path: ${s.path}`);
    });

    // Show branches that exist but have no worktree
    const worktreeBranches = new Set(sandboxes.map((s) => s.branch));
    const orphaned = allBranches.filter((b) => !worktreeBranches.has(b));
    if (orphaned.length > 0) {
        warn(`${String(orphaned.length)} branch${orphaned.length !== 1 ? 'es' : ''} without worktrees:`);
        orphaned.forEach((b) => {
            const slug = b.replace('agent/', '');
            logger.info(`    ${dim(slug)} ${dim(`(branch: ${b})`)}`);
        });
    }

    logger.raw('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
