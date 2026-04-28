#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { parse_args, red, green, dim, cyan, bold } from '../../Terminal/useCases/index.ts';
import { load_config } from '../../Terminal/useCases/index.ts';
import { get_repo_root, get_repo_name, worktree_create, branch_exists } from '../../Workspace/useCases/index.ts';
import { write_state } from '../../AgentState/useCases/index.ts';
import { create_or_update_task_file, derive_names, validate_dag, topological_sort } from '../../TaskManagement/useCases/index.ts';
import { get_adapter } from '../../Adapters/useCases/index.ts';
import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

export type LoadTaskGraphError = AppError<
    'InvalidTaskGraph',
    { file: string; reason: string }
>;

export type LoadTaskGraphResult = Result<TaskNode[], LoadTaskGraphError>;

type TaskNode = {
    id: string;
    description: string;
    dependencies: string[];
};

function is_task_node(value: unknown): value is TaskNode {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.id !== 'string' || typeof node.description !== 'string') {
        return false;
    }
    if (!Array.isArray(node.dependencies)) {
        return false;
    }
    return node.dependencies.every((d) => typeof d === 'string');
}

export function load_task_graph(path: string): LoadTaskGraphResult {
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return err(createAppError('InvalidTaskGraph', `Failed to read file: ${message}`, { file: path, reason: message }));
    }

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return err(createAppError('InvalidTaskGraph', `Invalid JSON in task graph: ${message}`, { file: path, reason: message }));
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return err(createAppError('InvalidTaskGraph', 'Invalid task graph: expected object with a "tasks" array', { file: path, reason: 'not an object' }));
    }
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj.tasks)) {
        return err(createAppError('InvalidTaskGraph', 'Invalid task graph: expected { tasks: [...] }', { file: path, reason: 'missing tasks array' }));
    }

    const invalid = obj.tasks.findIndex((t) => !is_task_node(t));
    if (invalid !== -1) {
        return err(createAppError('InvalidTaskGraph', `Invalid task at index ${String(invalid)}: each task needs { id: string, description: string, dependencies: string[] }`, { file: path, reason: 'invalid task node' }));
    }

    return ok(obj.tasks as TaskNode[]);
}

export function spawn_agent(
    repoRoot: string,
    slug: string,
    worktreePath: string,
    config: ReturnType<typeof load_config>
): ChildProcess | null {
    const agentName = config.defaultAgent ?? 'claude';
    const agentCfg = config.agents?.[agentName];
    if (!agentCfg) {
        console.error(red(`Agent "${agentName}" not configured. Skipping ${slug}.`));
        return null;
    }

    const adapter = get_adapter(agentName);
    const args = adapter
        ? adapter.build_args(slug, agentCfg.args)
        : agentCfg.args;

    const child = spawn(agentCfg.command, args, {
        cwd: worktreePath,
        detached: true,
        stdio: 'ignore',
    });

    if (child.pid) {
        write_state(repoRoot, slug, {
            status: 'running',
            backend: 'decompose-orchestrator',
            agent: agentName,
            pid: child.pid,
        });
    }

    return child;
}

export function track_child(child: ChildProcess): Promise<number> {
    return new Promise((resolve) => {
        child.on('exit', (code, signal) => {
            resolve(signal ? 1 : (code ?? 1));
        });
        child.on('error', () => {
            resolve(1);
        });
    });
}

export async function execute_dag(
    tasks: TaskNode[],
    repoRoot: string,
    parentSlug: string,
    config: ReturnType<typeof load_config>
): Promise<number> {
    const repoName = get_repo_name(repoRoot);
    const sorted = topological_sort(tasks);
    const statusMap = new Map<string, 'pending' | 'running' | 'done' | 'failed'>();
    for (const task of tasks) {
        statusMap.set(task.id, 'pending');
    }

    // Pre-create all worktrees and task files
    for (const task of sorted) {
        const slug = `${parentSlug}-${task.id}`;
        const { branch, worktreePath: rawWorktreePath } = derive_names(slug, repoName, config as Record<string, string>);
        const worktreePath = resolve(repoRoot, rawWorktreePath);

        if (!branch_exists(branch, repoRoot)) {
            const createResult = worktree_create(worktreePath, branch, config.defaultBaseBranch ?? 'main', repoRoot);
            if (!createResult.ok) {
                console.error(red(`Failed to create worktree for ${slug}: ${createResult.error.message}`));
                statusMap.set(task.id, 'failed');
                continue;
            }
        }

        const agentsDir = join(worktreePath, '.agents');
        if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });
        const tasksDir = join(agentsDir, 'tasks');
        if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

        const taskFilePath = join(tasksDir, `${slug}.md`);
        const templateDir = join(repoRoot, '.agents', 'templates');
        const data: Record<string, string> = {
            title: task.description,
            slug,
            agent: config.defaultAgent ?? 'claude',
            branch,
            baseBranch: config.defaultBaseBranch ?? 'main',
            worktreePath,
            createdAt: new Date().toISOString(),
            status: 'active',
            taskFile: `.agents/tasks/${slug}.md`,
            type: 'decompose',
        };

        if (config.writeTaskTemplateOnCreate !== false) {
            create_or_update_task_file(taskFilePath, templateDir, data);
        }
    }

    console.log(cyan(`\nExecuting ${bold(String(tasks.length))} tasks in dependency waves...\n`));

    // Execute in waves
    let waveIndex = 0;
    for (;;) {
        const ready = sorted.filter((task) => {
            if (statusMap.get(task.id) !== 'pending') return false;
            return task.dependencies.every((dep) => statusMap.get(dep) === 'done');
        });

        if (ready.length === 0) {
            const stillPending = sorted.filter((t) => statusMap.get(t.id) === 'pending');
            if (stillPending.length > 0) {
                console.error(red(`\nDeadlock detected: ${String(stillPending.length)} tasks cannot start due to failed dependencies.`));
                for (const t of stillPending) {
                    console.error(red(`  - ${t.id}: ${t.description}`));
                }
                return 1;
            }
            break;
        }

        waveIndex++;
        console.log(dim(`Wave ${String(waveIndex)}: launching ${String(ready.length)} task(s)`));

        const wavePromises = ready.map(async (task) => {
            const slug = `${parentSlug}-${task.id}`;
            if (statusMap.get(task.id) === 'failed') {
                return { id: task.id, exitCode: 1 };
            }

            const { worktreePath: rawWorktreePath } = derive_names(slug, repoName, config as Record<string, string>);
            const worktreePath = resolve(repoRoot, rawWorktreePath);

            const child = spawn_agent(repoRoot, slug, worktreePath, config);
            if (!child) {
                statusMap.set(task.id, 'failed');
                return { id: task.id, exitCode: 1 };
            }

            statusMap.set(task.id, 'running');
            const exitCode = await track_child(child);
            statusMap.set(task.id, exitCode === 0 ? 'done' : 'failed');

            write_state(repoRoot, slug, {
                status: exitCode === 0 ? 'done' : 'failed',
                backend: 'decompose-orchestrator',
                agent: config.defaultAgent ?? 'claude',
            });

            const indicator = exitCode === 0 ? green('✓') : red('✗');
            console.log(`  ${indicator} ${slug} ${exitCode === 0 ? dim('(done)') : red(`(exit ${String(exitCode)})`)}`);

            return { id: task.id, exitCode };
        });

        await Promise.all(wavePromises);
    }

    const failed = sorted.filter((t) => statusMap.get(t.id) === 'failed');
    const done = sorted.filter((t) => statusMap.get(t.id) === 'done');

    console.log('');
    if (failed.length === 0) {
        console.log(green(`✓ All ${String(done.length)} tasks completed successfully.`));
        return 0;
    } else {
        console.log(red(`✗ ${String(failed.length)} of ${String(tasks.length)} tasks failed.`));
        return 1;
    }
}

export function run(): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { flags, positional } = parse_args(process.argv.slice(2));
    const graphFile = positional[0];
    const dryRun = flags.get('dry-run') === true;
    const execute = flags.get('execute') === true;
    const maxTasksRaw = flags.get('max-tasks');
    const maxTasks = parseInt(typeof maxTasksRaw === 'string' ? maxTasksRaw : '5', 10);

    if (!graphFile) {
        console.error(red('Usage: swarm decompose <task-graph.json> [--dry-run] [--execute] [--max-tasks N]'));
        return 1;
    }

    const fullPath = graphFile.startsWith('/') ? graphFile : `${repoRoot}/${graphFile}`;
    if (!existsSync(fullPath)) {
        console.error(red(`File not found: ${graphFile}`));
        return 1;
    }

    let tasks: TaskNode[];
    const loadResult = load_task_graph(fullPath);
    if (!loadResult.ok) {
        console.error(red(`Failed to load task graph: ${loadResult.error.message}`));
        return 1;
    }
    tasks = loadResult.value;

    if (tasks.length > maxTasks) {
        console.log(dim(`Truncating to ${String(maxTasks)} tasks (found ${String(tasks.length)}).`));
        tasks = tasks.slice(0, maxTasks);
    }

    const validation = validate_dag(tasks);
    if (!validation.valid) {
        console.error(red('Invalid task graph: cycle or missing dependency detected.'));
        if (validation.cycle) {
            console.error(red(`Cycle: ${validation.cycle.join(' -> ')}`));
        }
        return 1;
    }

    const sorted = topological_sort(tasks);

    console.log(green('Task DAG (topological order):\n'));
    for (const task of sorted) {
        const depStr = task.dependencies.length > 0 ? ` (deps: ${task.dependencies.join(', ')})` : '';
        console.log(`  ${task.id}${depStr}`);
        console.log(`    ${task.description}`);
    }

    if (dryRun) {
        console.log(dim('\nDry run complete. No worktrees created.'));
        return 0;
    }

    if (!execute) {
        console.log(dim('\nUse --execute to create worktrees and launch agents, or --dry-run to preview.'));
        return 0;
    }

    const parentSlug = `decompose-${String(Date.now())}`;
    const config = load_config(repoRoot);

    void execute_dag(tasks, repoRoot, parentSlug, config).then((code) => {
        process.exitCode = code;
    });
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
