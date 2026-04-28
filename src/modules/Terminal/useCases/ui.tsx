#!/usr/bin/env node

import React, { useEffect, useState } from 'react';
import { render, Box, Text } from 'ink';
import { is_process_running, read_state } from '../../AgentState/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';

type Worktree = ReturnType<typeof worktree_list>[number];

const ASCII_LOGO = `
   _____ _       __  ___   ____   __  ___
  / ___/| |     / / /   | / __ \\ /  |/  /
  \\__ \\ | | /| / / / /| |/ /_/ // /|_/ / 
 ___/ / | |/ |/ / / ___ / _, _// /  / /  
/____/  |__/|__/ /_/  |_/_/ |_|/_/  /_/  
`;

type SandboxState = {
    slug: string;
    branch: string;
    path: string;
    statusTag: string;
    statusColor: string;
    pid?: number;
    backend?: string;
};

export const Dashboard = ({ repoRoot }: { repoRoot: string }) => {
    const get_sandboxes = () => {
        const list = worktree_list(repoRoot);
        const globalState = read_state(repoRoot);

        return list.map((s: Worktree) => {
            const slug = s.branch?.replace('agent/', '') ?? 'unknown';
            const state = globalState[slug] ?? {};
            let statusTag = '[IDLE]';
            let statusColor = 'gray';

            if (state.status === 'running') {
                if (state.pid) {
                    const alive = is_process_running(state.pid);
                    statusTag = alive ? '[RUNNING]' : '[CRASHED]';
                    statusColor = alive ? 'green' : 'red';
                } else {
                    statusTag = '[LAUNCHED]';
                    statusColor = 'green';
                }
            } else if (state.status) {
                statusTag = `[${state.status.toUpperCase()}]`;
                statusColor = 'yellow';
            }

            return {
                slug,
                branch: s.branch ?? 'unknown',
                path: s.path,
                statusTag,
                statusColor,
                pid: state.pid,
                backend: state.backend,
            };
        });
    };

    const [sandboxes, setSandboxes] = useState<SandboxState[]>(get_sandboxes);
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const update = () => {
            setSandboxes(get_sandboxes());
            setTime(new Date());
        };

        const interval = setInterval(update, 2000);
        return () => clearInterval(interval);
    }, [repoRoot]);

    return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
            <Box flexDirection="column" marginBottom={1}>
                <Text color="cyan" bold>
                    {ASCII_LOGO}
                </Text>
                <Text color="gray">
                    Command Center <Text italic>(Updated: {time.toLocaleTimeString()})</Text>
                </Text>
            </Box>

            <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
                <Box marginBottom={1}><Text bold>Active Sandboxes</Text></Box>
                
                {sandboxes.length === 0 ? (
                    <Text color="gray">No active agents in the swarm.</Text>
                ) : (
                    sandboxes.map((s) => (
                        <Box key={s.slug} flexDirection="column" marginBottom={1}>
                            <Box>
                                <Box width={14}>
                                    <Text color={s.statusColor as any}>{s.statusTag}</Text>
                                </Box>
                                <Text bold>{s.slug}</Text>
                                {s.pid && <Text color="gray"> (PID: {s.pid})</Text>}
                                {s.backend && <Text color="gray"> via {s.backend}</Text>}
                            </Box>
                            <Box paddingLeft={2}>
                                <Text color="gray">↳ Branch: {s.branch}  Path: {s.path}</Text>
                            </Box>
                        </Box>
                    ))
                )}
            </Box>
            
            <Box marginTop={1}><Text color="gray">Press Ctrl+C to exit.</Text></Box>
        </Box>
    );
};

export function run() {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error('Error: Not inside a git repository.');
        process.exit(1);
        return;
    }

    render(<Dashboard repoRoot={repoRoot} />);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run();
}
