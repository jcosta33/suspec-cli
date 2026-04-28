#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { cyan, green, red, bold, dim, summarize_insight } from '../../Terminal/useCases/index.ts';
import { get_repo_root, worktree_list } from '../../Workspace/useCases/index.ts';
import { read_state } from '../../AgentState/useCases/index.ts';

type CheckResult = {
    label: string;
    ok: boolean;
    message: string;
};

export function check_command(cmd: string, args: string[]): { ok: boolean; version: string } {
    const res = spawnSync(cmd, args, { encoding: 'utf8' });
    if (res.status === 0) {
        return { ok: true, version: res.stdout.trim().split('\n')[0] };
    }
    return { ok: false, version: '' };
}

export async function run(): Promise<number> {
    console.log(cyan('\n🩺 Swarm Doctor\n'));

    const results: CheckResult[] = [];

    // Node version
    const nodeCheck = check_command('node', ['-v']);
    if (nodeCheck.ok) {
        const major = parseInt(nodeCheck.version.slice(1).split('.')[0], 10);
        if (major >= 22) {
            results.push({ label: 'Node.js', ok: true, message: nodeCheck.version });
        } else {
            results.push({ label: 'Node.js', ok: false, message: `${nodeCheck.version} (>= 22.6.0 required)` });
        }
    } else {
        results.push({ label: 'Node.js', ok: false, message: 'not found' });
    }

    // Git
    const gitCheck = check_command('git', ['--version']);
    results.push({ label: 'Git', ok: gitCheck.ok, message: gitCheck.ok ? gitCheck.version : 'not found' });

    // Package manager
    const pnpmCheck = check_command('pnpm', ['--version']);
    const npmCheck = check_command('npm', ['--version']);
    if (pnpmCheck.ok) {
        results.push({ label: 'Package manager', ok: true, message: `pnpm ${pnpmCheck.version}` });
    } else if (npmCheck.ok) {
        results.push({ label: 'Package manager', ok: true, message: `npm ${npmCheck.version}` });
    } else {
        results.push({ label: 'Package manager', ok: false, message: 'pnpm or npm not found' });
    }

    // Git rerere
    let repoRoot: string | null = null;
    try {
        repoRoot = get_repo_root();
        const rerereRes = spawnSync('git', ['config', 'rerere.enabled'], { cwd: repoRoot, encoding: 'utf8' });
        if (rerereRes.stdout.trim() === 'true') {
            results.push({ label: 'Git rerere', ok: true, message: 'enabled' });
        } else {
            results.push({ label: 'Git rerere', ok: false, message: 'disabled (run swarm init to enable)' });
        }
    } catch {
        results.push({ label: 'Git workspace', ok: false, message: 'not inside a git repository' });
    }

    // Workspace checks
    if (repoRoot) {
        const agentsDir = join(repoRoot, '.agents');
        if (existsSync(agentsDir)) {
            results.push({ label: '.agents directory', ok: true, message: agentsDir });
        } else {
            results.push({ label: '.agents directory', ok: false, message: 'missing (run swarm init)' });
        }

        const configPath = join(repoRoot, 'swarm.config.json');
        if (existsSync(configPath)) {
            results.push({ label: 'swarm.config.json', ok: true, message: 'found' });
        } else {
            results.push({ label: 'swarm.config.json', ok: false, message: 'missing (run swarm init)' });
        }

        const state = read_state(repoRoot);
        const stateCount = Object.keys(state).length;
        results.push({ label: 'Agent state entries', ok: true, message: `${String(stateCount)} recorded` });

        const worktrees = worktree_list(repoRoot);
        const agentWorktrees = worktrees.filter((w) => w.branch?.startsWith('agent/'));
        results.push({ label: 'Agent worktrees', ok: true, message: `${String(agentWorktrees.length)} active` });

        const telemetryDb = join(repoRoot, '.agents', 'logs', 'telemetry.db');
        if (existsSync(telemetryDb)) {
            results.push({ label: 'Telemetry DB', ok: true, message: 'found' });
        } else {
            results.push({ label: 'Telemetry DB', ok: true, message: 'not yet created' });
        }
    }

    // Print results
    let failures = 0;
    for (const r of results) {
        const icon = r.ok ? green('✓') : red('✗');
        const col = r.ok ? dim : red;
        console.log(`  ${icon} ${bold(r.label.padEnd(20))} ${col(r.message)}`);
        if (!r.ok) failures++;
    }

    console.log('');
    if (repoRoot) {
        const summaryPrompt = `Summarize this Swarm CLI diagnostic output in one short, punchy sentence. Focus on whether the system is fully operational or if something is broken: ${JSON.stringify(results)}`;
        const insight = await summarize_insight(repoRoot, summaryPrompt);
        if (insight) {
            console.log(cyan(`✨ AI Insight: `) + dim(insight) + '\n');
        }
    }

    if (failures === 0) {
        console.log(green('All checks passed. Swarm is healthy!\n'));
        return 0;
    }
    console.log(red(`${String(failures)} check${failures !== 1 ? 's' : ''} failed. See above for details.\n`));
    return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    run().then(code => {
        process.exitCode = code;
    });
}
