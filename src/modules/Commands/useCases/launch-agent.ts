#!/usr/bin/env node

import { get_adapter } from '../../Adapters/useCases/index.ts';
import { write_state } from '../../AgentState/useCases/index.ts';
import { swarmBus } from '../../../infra/events/swarmBus.ts';
import {
    check_backend,
    command_exists,
    error,
    launch,
    load_config,
    red,
    resolve_backend,
    notify,
} from '../../Terminal/useCases/index.ts';

type LaunchAgentInput = {
    repoRoot: string;
    slug: string;
    worktreePath: string;
    title?: string;
    agent?: string;
};

/**
 * Resolve agent configuration and launch the agent in the configured backend.
 * @returns Exit code (0 for success, 1 for failure).
 */
export function launch_agent(input: LaunchAgentInput): number {
    const { repoRoot, slug, worktreePath, title, agent: agentOverride } = input;

    const config = load_config(repoRoot);
    const agentName = agentOverride ?? config.defaultAgent ?? 'claude';
    const agentCfg = config.agents?.[agentName];

    if (!agentCfg) {
        error(`Agent "${agentName}" not configured.`);
        return 1;
    }

    if (!command_exists(agentCfg.command)) {
        error(
            `Agent command "${agentCfg.command}" not found in PATH. Install ${agentName} first.`
        );
        return 1;
    }

    const backend = resolve_backend(config.defaultTerminal ?? 'auto');
    const backendCheck = check_backend(backend);
    if (!backendCheck.ok) {
        error(
            `Backend "${backend}" is not available: ${backendCheck.reason ?? 'unknown'}`
        );
        return 1;
    }

    const adapter = get_adapter(agentName);
    const args = adapter
        ? adapter.build_args(slug, agentCfg.args)
        : agentCfg.args;

    const bannerInfo = {
        title: title ?? `Task: ${slug}`,
        slug,
        branch: `agent/${slug}`,
        taskFile: `${worktreePath}/.agents/tasks/${slug}.md`,
        agent: agentName,
    };

    write_state(repoRoot, slug, {
        status: 'running',
        backend,
        agent: agentName,
    });

    const startedAt = new Date().toISOString();

    // Fire `agent.launched` before `launch()` blocks. Sync listeners run
    // inline so the audit row is on disk before control passes to the
    // agent process — useful for diagnostics if `launch()` never returns.
    void swarmBus.emit('agent.launched', {
        repoRoot,
        slug,
        agent: agentName,
        backend,
        startedAt,
    });

    const launchResult = launch(backend, worktreePath, agentCfg.command, args, bannerInfo, repoRoot);
    const finishedAt = new Date().toISOString();
    
    if (!launchResult.ok) {
        error(`Failed to launch agent: ${launchResult.error.message}`);
        
        notify('Swarm CLI', `Failed to launch agent ${agentName} for ${slug}.`);
        
        void swarmBus.emit('agent.session.recorded', {
            repoRoot,
            slug,
            agent: agentName,
            startedAt,
            finishedAt,
            exitCode: null,
        });
        
        return 1;
    }

    const exitCode = launchResult.value;
    const numericExitCode = typeof exitCode === 'number' ? exitCode : null;

    // Sync handlers (the telemetry recorder) run inline before emit() resolves,
    // so this fire-and-forget call still persists the row before we return.
    void swarmBus.emit('agent.session.recorded', {
        repoRoot,
        slug,
        agent: agentName,
        startedAt,
        finishedAt,
        exitCode: numericExitCode,
    });

    if (typeof exitCode === 'number') {
        const msg = exitCode === 0 ? 'completed successfully.' : `failed with exit code ${String(exitCode)}.`;
        notify('Swarm CLI', `Agent ${agentName} for task ${slug} ${msg}`);
        return exitCode;
    }
    return 0;
}

/**
 * Orchestrate agent launch with error handling and logging.
 * Prints to stdout/stderr and returns an exit code.
 */
export function run_agent_launch(input: LaunchAgentInput): number {
    try {
        const code = launch_agent(input);
        if (code !== 0) {
            return code;
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(red(`Failed to launch agent: ${message}`));
        return 1;
    }
    return 0;
}
