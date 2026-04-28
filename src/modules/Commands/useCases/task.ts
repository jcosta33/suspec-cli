#!/usr/bin/env node

import {
    green,
    parse_args,
    prompt_input,
    red,
} from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';

export async function run(): Promise<number> {
    let repoRoot: string;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const slug = positional[0];

    if (!slug) {
        console.log(red('Usage: swarm task <slug>'));
        return 1;
    }

    const taskFile = join(repoRoot, '.agents', 'tasks', `${slug}.md`);
    if (!existsSync(taskFile)) {
        console.error(red(`Task file not found: ${taskFile}`));
        return 1;
    }

    const note = await prompt_input('Human note / feedback to append: ');
    if (!note) {
        console.log(red('No note provided. Aborting.'));
        return 1;
    }

    const timestamp = new Date().toISOString();
    const entry = `\n\n## Human Feedback (${timestamp})\n${note}\n`;
    appendFileSync(taskFile, entry, 'utf8');

    console.log(green(`✓ Note appended to ${slug}.md`));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    void run().then((code) => {
        process.exitCode = code;
    });
}
