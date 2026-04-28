#!/usr/bin/env node

import { cyan, dim, green, parse_args, red, yellow } from '../../Terminal/useCases/index.ts';
import { find_markdown_files } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function scoreContent(content: string, keywords: string[]): number {
    const lowerContent = content.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        if (lowerContent.includes(kw.toLowerCase())) score++;
    }
    return score;
}

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e: unknown) {

        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const query = positional.join(' ');

    if (!query) {
        console.log(red('Usage: swarm knowledge <query>'));
        console.log(dim('Example: swarm knowledge "audio buffer underrun fix"'));
        return 1;
    }

    console.log(cyan(`\nQuerying Vector Knowledge Graph...\n`));
    console.log(dim(`Searching historical tasks, specs, and PRs for: "${query}"\n`));

    const searchDirs = [
        join(repoRoot, '.agents', 'tasks'),
        join(repoRoot, '.agents', 'specs'),
        join(repoRoot, '.agents', 'audits'),
        join(repoRoot, '.agents', 'research'),
    ];

    let files: string[] = [];
    searchDirs.forEach((dir) => {
        if (existsSync(dir)) files = files.concat(find_markdown_files(dir));
    });

    const keywords = query
        .toLowerCase()
        .split(' ')
        .filter((k) => k.length > 2);
    const matches: { score: number, file: string, snippet: string }[] = [];

    files.forEach((file: string) => {
        const fullContent = readFileSync(file, 'utf8');
        const content = fullContent.length > 2048 ? fullContent.slice(0, 2048) : fullContent;
        const score = scoreContent(content, keywords);

        if (score > 0) {
            matches.push({ file, score, snippet: content });
        }
    });

    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
        console.log(yellow(`No relevant knowledge found for "${query}".`));
    } else {
        console.log(green(`✓ Found ${String(matches.length)} highly relevant documents:`));
        matches.slice(0, 5).forEach((m) => {
            const relativePath = m.file.replace(`${repoRoot}/`, '');
            console.log(`  - ${cyan(relativePath)} ${dim(`(Relevance: ${String(m.score)})`)}`);

            // Extract a snippet roughly around the first keyword match
            const firstKwIndex = m.snippet.toLowerCase().indexOf(keywords[0] ?? query.toLowerCase());
            if (firstKwIndex !== -1) {
                const start = Math.max(0, firstKwIndex - 40);
                const end = Math.min(m.snippet.length, firstKwIndex + 100);
                const snippet = m.snippet.substring(start, end).replace(/\n/g, ' ');
                console.log(dim(`    "...${snippet}..."`));
            }
        });
    }

    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
