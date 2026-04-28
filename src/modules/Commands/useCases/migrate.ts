#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { red, cyan, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

const newCommandPath = join(dirname(fileURLToPath(import.meta.url)), 'new.ts');

export function run(): number {
    let repoRoot;
    try {
        repoRoot = get_repo_root();
    } catch (_e) {
        console.error(red('Error: Not inside a git repository.'));
        return 1;
    }

    const { positional } = parse_args(process.argv.slice(2));
    const targetFile = positional[0];
    const targetLang = positional[1] || 'Rust';
    
    if (!targetFile) {
        console.log(red('Usage: swarm migrate <file> [TargetLanguage]'));
        return 1;
    }

    const resolved = resolve_within(repoRoot, targetFile);
    if (!resolved.ok) {
        console.error(red(resolved.error.message));
        return 1;
    }
    const fullPath = resolved.value;
    if (!existsSync(fullPath)) {
        console.error(red(`File not found: ${targetFile}`));
        return 1;
    }

    console.log(cyan(`\nInitializing Framework Translation Protocol...\n`));

    const baseName = basename(targetFile, '.ts');
    const translatorSlug = `translate-${baseName}`;
    const verifierSlug = `verify-${baseName}`;

    const tasksDir = join(repoRoot, '.agents', 'tasks');
    if (!existsSync(tasksDir)) mkdirSync(tasksDir, { recursive: true });

    // Translator Task
    const transTask = join(tasksDir, `${translatorSlug}.md`);
    writeFileSync(transTask, `# Translate ${baseName} to ${targetLang}

## Metadata
- Slug: ${translatorSlug}

## Objective
Rewrite \`${targetFile}\` entirely into ${targetLang}. Maintain exact behavioral parity. Do NOT alter the tests.
`, 'utf8');

    // Verifier Task
    const verTask = join(tasksDir, `${verifierSlug}.md`);
    writeFileSync(verTask, `# Verify Translation of ${baseName}

## Metadata
- Slug: ${verifierSlug}

## Objective
Wait for \`${translatorSlug}\` to finish. Run the test suite against the new ${targetLang} implementation. Find edge cases they missed.
`, 'utf8');

    console.log(green(`✓ Orchestration planned.`));
    console.log(dim(`  Translator: ${translatorSlug}`));
    console.log(dim(`  Verifier:   ${verifierSlug}`));

    // Spawn Translator
    console.log(cyan(`\nSpawning Translator Agent...`));
    spawnSync(process.execPath, ['--experimental-strip-types', newCommandPath, translatorSlug, '--type', 'feature'], { stdio: 'inherit', cwd: repoRoot });

    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
