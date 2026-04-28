#!/usr/bin/env node

import { parse_args, red, green, dim, logger, cyan } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import {
    prune_events,
    prune_sessions,
    query_sessions,
    read_events,
} from '../../AgentState/useCases/index.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        logger.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { flags } = parse_args(process.argv.slice(2));
    const asJson = flags.get('json') === true;
    const agent = flags.get('agent') as string | undefined;
    const slug = flags.get('slug') as string | undefined;
    const follow = flags.get('follow') === true;
    const showEvents = flags.get('events') === true;
    const pruneDaysRaw = flags.get('prune') as string | undefined;

    if (showEvents) {
        return run_events_view(repoRoot, { follow, asJson, eventFilter: agent, slugFilter: slug });
    }

    if (pruneDaysRaw !== undefined) {
        const days = parseInt(pruneDaysRaw, 10);
        if (Number.isNaN(days)) {
            logger.error(red('Invalid --prune value. Expected number of days.'));
            return 1;
        }
        const eventsDeleted = prune_events(repoRoot, days);
        const sessionsDeleted = prune_sessions(repoRoot, days);
        logger.info(green(`Pruned ${String(eventsDeleted)} events and ${String(sessionsDeleted)} sessions older than ${String(days)} days.`));
        return 0;
    }

    if (follow) {
        logger.info(dim('Following telemetry stream (Ctrl+C to stop)...\n'));
        let lastCount = 0;
        const poll = () => {
            const latest = query_sessions(repoRoot, 50);
            let filtered = latest;
            if (agent) filtered = filtered.filter((s) => s.agent === agent);
            if (slug) filtered = filtered.filter((s) => s.slug === slug);
            if (filtered.length > lastCount) {
                const newSessions = filtered.slice(lastCount);
                for (const session of newSessions) {
                    const duration = session.finished_at
                        ? `${String(Math.round((new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000))}s`
                        : 'running';
                    logger.raw(`  ${session.slug.padEnd(20)} ${session.agent.padEnd(10)} ${duration.padEnd(10)} exit:${String(session.exit_code ?? '-')}  ${dim(session.started_at)}`);
                }
                lastCount = filtered.length;
            }
        };
        poll();
        const interval = setInterval(poll, 2000);
        process.on('SIGINT', () => {
            clearInterval(interval);
            logger.raw('');
            return;
        });
        return 0;
    }

    const sessions = query_sessions(repoRoot, 50);

    if (sessions.length === 0) {
        logger.info(dim('No sessions found.'));
        return 0;
    }

    let filtered = sessions;
    if (agent) {
        filtered = filtered.filter((s) => s.agent === agent);
    }
    if (slug) {
        filtered = filtered.filter((s) => s.slug === slug);
    }

    if (asJson) {
        logger.raw(JSON.stringify(filtered, null, 2));
        return 0;
    }

    logger.raw('Recent sessions:\n');
    for (const session of filtered) {
        const duration = session.finished_at
            ? `${String(Math.round((new Date(session.finished_at).getTime() - new Date(session.started_at).getTime()) / 1000))}s`
            : 'running';
        logger.raw(`  ${session.slug.padEnd(20)} ${session.agent.padEnd(10)} ${duration.padEnd(10)} exit:${String(session.exit_code ?? '-')}`);
    }

    logger.raw(`\nTotal: ${String(filtered.length)} sessions\n`);
    return 0;
}

type RunEventsViewInput = {
    follow: boolean;
    asJson: boolean;
    eventFilter?: string;
    slugFilter?: string;
};

function format_event_line(entry: ReturnType<typeof read_events>[number]): string {
    const slug = (entry.payload.slug as string | undefined) ?? '';
    const slugCol = slug.padEnd(20);
    return `  ${dim(entry.timestamp)}  ${cyan(entry.event.padEnd(24))}  ${slugCol}  ${dim(JSON.stringify(entry.payload))}`;
}

function run_events_view(repoRoot: string, input: RunEventsViewInput): number {
    const filterEntry = (entry: ReturnType<typeof read_events>[number]) => {
        if (input.eventFilter && !entry.event.startsWith(input.eventFilter)) {
            return false;
        }
        if (input.slugFilter && entry.payload.slug !== input.slugFilter) {
            return false;
        }
        return true;
    };

    if (input.follow) {
        logger.info(dim('Following event stream (Ctrl+C to stop)...\n'));
        let lastCount = 0;
        const poll = () => {
            const latest = read_events(repoRoot, 0);
            const filtered = latest.filter(filterEntry);
            if (filtered.length > lastCount) {
                for (const entry of filtered.slice(lastCount)) {
                    logger.raw(format_event_line(entry));
                }
                lastCount = filtered.length;
            }
        };
        poll();
        const interval = setInterval(poll, 1000);
        process.on('SIGINT', () => {
            clearInterval(interval);
            logger.raw('');
        });
        return 0;
    }

    const events = read_events(repoRoot, 50).filter(filterEntry);
    if (events.length === 0) {
        logger.info(dim('No events recorded yet.'));
        return 0;
    }

    if (input.asJson) {
        logger.raw(JSON.stringify(events, null, 2));
        return 0;
    }

    logger.raw('Recent events:\n');
    for (const entry of events) {
        logger.raw(format_event_line(entry));
    }
    logger.raw(`\nTotal: ${String(events.length)} events\n`);
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
