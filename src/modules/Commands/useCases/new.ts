#!/usr/bin/env node

import {
    bold,
    cyan,
    dim,
    green,
    logger,
    parse_args,
    prompt_input,
    red,
    success,
    yellow,
} from '../../Terminal/useCases/index.ts';
import { load_config } from '../../Terminal/useCases/index.ts';
import { write_state } from '../../AgentState/useCases/index.ts';
import {
    branch_exists,
    get_repo_name,
    get_repo_root,
    worktree_create,
    worktree_list,
} from '../../Workspace/useCases/index.ts';
import {
    create_or_update_task_file,
    derive_names,
    next_duplicate_slug,
    to_slug,
} from '../../TaskManagement/useCases/index.ts';

import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { run_agent_launch } from './launch-agent.ts';
import { swarmBus } from '../../../infra/events/swarmBus.ts';

type CreateSandboxInput = {
    slug: string;
    title: string;
    type?: string;
    launch: boolean;
};

export function create_sandbox(input: CreateSandboxInput): number {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        logger.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const config = load_config(repoRoot);
    const title = input.title;

    const slugResult = to_slug(input.slug, config.slugMaxLen);
    if (!slugResult.ok) {
        logger.error(red(`Error: ${slugResult.error.message}`));
        return 1;
    }
    let slug = slugResult.value;

    const repoName = get_repo_name(repoRoot);

    // Check for duplicates and auto-increment if needed
    const existingWorktrees = worktree_list(repoRoot);
    const existingSlugs = new Set(existingWorktrees.map((w) => w.branch?.replace('agent/', '') ?? ''));
    if (existingSlugs.has(slug) && !config.reuseExistingByDefault) {
        slug = next_duplicate_slug(slug, existingSlugs);
    }

    const { branch, worktreePath: rawWorktreePath } = derive_names(
        slug,
        repoName,
        config as Record<string, string>
    );
    const worktreePath = resolve(repoRoot, rawWorktreePath);

    // Check for existing branch or worktree
    const existing = existingWorktrees.find((w) => w.branch === branch);
    if (existing) {
        logger.info(
            yellow(
                `Worktree for "${slug}" already exists at ${existing.path}`
            )
        );
        if (config.reuseExistingByDefault) {
            logger.info(dim('Reusing existing worktree (--reuseExistingByDefault is true).'));
        } else {
            logger.error(red('Aborting. Use a different slug or remove the existing worktree.'));
            return 1;
        }
    }

    if (branch_exists(branch, repoRoot) && !existing) {
        logger.info(yellow(`Branch ${branch} already exists but has no worktree. Attaching to it.`));
    }

    // Create worktree
    logger.info(cyan(`\nCreating worktree for ${bold(slug)}...`));
    const createResult = worktree_create(worktreePath, branch, config.defaultBaseBranch ?? 'main', repoRoot);
    if (!createResult.ok) {
        logger.error(red(createResult.error.message));
        return 1;
    }
    success(`Worktree created: ${worktreePath}`);

    // Ensure .agents directories exist inside the worktree
    const agentsDir = join(worktreePath, '.agents');
    if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });
    const tasksDir = join(agentsDir, 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    // Create task file
    const taskFilePath = join(tasksDir, `${slug}.md`);
    const templateDir = join(repoRoot, '.agents', 'templates');

    const data: Record<string, string> = {
        title,
        slug,
        agent: config.defaultAgent ?? 'claude',
        branch,
        baseBranch: config.defaultBaseBranch ?? 'main',
        worktreePath,
        createdAt: new Date().toISOString(),
        status: 'active',
        taskFile: `.agents/tasks/${slug}.md`,
        type: input.type ?? '',
    };

    if (config.writeTaskTemplateOnCreate !== false) {
        create_or_update_task_file(taskFilePath, templateDir, data);
        success(`Task file created: ${taskFilePath}`);
    }

    // Write state
    write_state(repoRoot, slug, {
        status: 'created',
        backend: config.defaultTerminal ?? 'auto',
        agent: config.defaultAgent ?? 'claude',
    });

    void swarmBus.emit('sandbox.created', { repoRoot, slug, branch, worktreePath });

    logger.raw(
        cyan(`\nSandbox "${bold(slug)}" is ready.\n`) +
            dim(`  Branch:     ${branch}\n`) +
            dim(`  Worktree:   ${worktreePath}\n`) +
            dim(`  Task file:  ${taskFilePath}\n`)
    );

    // Optionally launch agent
    if (input.launch) {
        return run_agent_launch({ repoRoot, slug, worktreePath, title });
    }

    logger.info(
        cyan(`Run ${green(`swarm open ${slug}`)} to reopen it, or add --launch to auto-start the agent.`)
    );
    return 0;
}

export async function main(): Promise<number> {
    const { positional, flags } = parse_args(process.argv.slice(2));
    let slug = positional[0];
    let title = positional.slice(1).join(' ');

    if (!slug) {
        slug = await prompt_input('Task slug (e.g. billing-refactor): ');
    }
    if (!slug) {
        logger.error(red('Slug is required.'));
        return 1;
    }
    if (!title) {
        title = await prompt_input('Task title: ', slug);
    }

    return create_sandbox({
        slug,
        title,
        type: typeof flags.get('type') === 'string' ? (flags.get('type') as string) : undefined,
        launch: flags.get('launch') === true || flags.get('launch') === 'true',
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void main().then((code) => {
        process.exitCode = code;
    });
}
