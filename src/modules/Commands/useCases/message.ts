#!/usr/bin/env node

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { red, green, dim, parse_args, logger } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';
import { read_state } from '../../AgentState/useCases/index.ts';

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        logger.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const slug = positional[0];
    const jsonPayload = positional[1];

    if (!slug || !jsonPayload) {
        logger.error(red('Usage: swarm message <slug> <json>'));
        logger.info(dim('Example: swarm message my-agent \'{"type":"pause"}\''));
        return 1;
    }

    let payload: unknown;
    try {
        payload = JSON.parse(jsonPayload);
    } catch {
        logger.error(red('Invalid JSON payload.'));
        return 1;
    }

    const state = read_state(repoRoot);
    if (!state[slug]) {
        logger.error(red(`No agent found with slug: ${slug}`));
        return 1;
    }

    const mailboxDir = join(repoRoot, '.agents', 'mailbox');
    if (!existsSync(mailboxDir)) {
        mkdirSync(mailboxDir, { recursive: true });
    }

    const mailboxPath = join(mailboxDir, `${slug}.jsonl`);
    const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        payload,
    });

    appendFileSync(mailboxPath, `${entry}\n`, 'utf8');

    logger.info(green(`✓ Message queued for ${slug}`));
    logger.info(dim(`Mailbox: ${mailboxPath}`));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
