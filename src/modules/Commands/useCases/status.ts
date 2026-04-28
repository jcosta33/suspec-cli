#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { red, cyan, bold, dim, green, yellow, parse_args, logger } from '../../Terminal/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';
import { read_state, is_process_running } from '../../AgentState/useCases/index.ts';
import { query_sessions } from '../../AgentState/useCases/index.ts';

function format_duration(startedAt: string, finishedAt?: string | null): string {
    const start = new Date(startedAt);
    const end = finishedAt ? new Date(finishedAt) : new Date();
    const ms = end.getTime() - start.getTime();
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (minutes > 0) {
        return `${String(minutes)}m ${String(seconds)}s`;
    }
    return `${String(seconds)}s`;
}

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        logger.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const slug = positional[0];

    if (!slug) {
        logger.error(red('Usage: swarm status <slug>'));
        return 1;
    }

    // Gather state
    const state = read_state(repoRoot)[slug];
    const worktrees = worktree_list(repoRoot);
    const worktree = worktrees.find((w) => w.branch === `agent/${slug}`);
    const taskFile = worktree ? join(worktree.path, '.agents', 'tasks', `${slug}.md`) : null;

    // Gather telemetry
    let sessions: ReturnType<typeof query_sessions> = [];
    try {
        sessions = query_sessions(repoRoot, 10).filter((s) => s.slug === slug);
    } catch (_e: unknown) {
        // Telemetry DB may not exist yet
    }

    logger.raw(cyan(`\n📊 Status: ${bold(slug)}\n`));

    // State section
    if (state) {
        let statusColor = yellow;
        if (state.status === 'running') {
            statusColor = green;
        } else if (state.status === 'error') {
            statusColor = red;
        }
        logger.raw(`${bold('State:')} ${statusColor(state.status ?? 'unknown')}`);
        if (state.agent) logger.raw(`${bold('Agent:')} ${state.agent}`);
        if (state.pid) {
            const running = is_process_running(state.pid);
            logger.raw(`${bold('PID:')} ${String(state.pid)} ${running ? green('(running)') : dim('(not running)')}`);
        }
        if (state.lastUpdated) {
            const lastUpdated = new Date(state.lastUpdated);
            logger.raw(`${bold('Last updated:')} ${lastUpdated.toLocaleString()}`);
        }
        if (state.exitCode !== undefined && state.exitCode !== null) {
            logger.raw(`${bold('Exit code:')} ${state.exitCode === 0 ? green('0') : red(String(state.exitCode))}`);
        }
        if (state.error) {
            logger.raw(`${bold('Error:')} ${red(state.error)}`);
        }
    } else {
        logger.info(dim('No state record found.'));
    }

    // Worktree section
    logger.raw('');
    if (worktree) {
        logger.raw(`${bold('Worktree:')} ${worktree.path}`);
        logger.raw(`${bold('Branch:')} ${worktree.branch ?? 'unknown'}`);

        const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: worktree.path, encoding: 'utf8' }).stdout.trim();
        if (dirty.length > 0) {
            const count = dirty.split('\n').length;
            logger.raw(`${bold('Working tree:')} ${yellow(`${String(count)} uncommitted change${count !== 1 ? 's' : ''}`)}`);
        } else {
            logger.raw(`${bold('Working tree:')} ${green('clean')}`);
        }
    } else {
        logger.info(dim('No worktree found for this slug.'));
    }

    // Task file section
    if (taskFile && existsSync(taskFile)) {
        const content = readFileSync(taskFile, 'utf8');
        const objectiveMatch = /## Objective\n+([^#]+)/.exec(content);
        const objective = objectiveMatch ? objectiveMatch[1].trim().split('\n')[0] : null;
        if (objective) {
            logger.raw(`\n${bold('Objective:')} ${dim(objective)}`);
        }
    }

    // Telemetry section
    if (sessions.length > 0) {
        logger.raw(`\n${bold('Recent sessions:')}`);
        for (const session of sessions.slice(0, 5)) {
            const duration = format_duration(session.started_at, session.finished_at);
            const agent = session.agent;
            let status: string;
            if (session.exit_code === null) {
                status = yellow('running');
            } else if (session.exit_code === 0) {
                status = green('success');
            } else {
                status = red(`failed (${String(session.exit_code)})`);
            }
            logger.raw(`  ${dim(session.started_at)} | ${agent.padEnd(10)} | ${duration.padStart(6)} | ${status}`);
        }
    }

    logger.raw('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
