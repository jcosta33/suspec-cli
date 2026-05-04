#!/usr/bin/env node

import { spinner } from '@clack/prompts';
import { bold, dim, green, parse_args, red, yellow } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';

export function find_impacted_specs(repoRoot: string, targetFile: unknown) {
    const targetName = basename(targetFile as string, ".ts").replace('.tsx', '');
    const specs: string[] = [];

    // Very naive blast radius: find any .spec.ts or .spec.tsx files that import the targetName
    // In a real swarm this uses `dependency-cruiser` or a TS Language Service AST graph.
    function scan(dir: string) {
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
                const fullPath = join(dir, entry);
                if (statSync(fullPath).isDirectory()) {
                    scan(fullPath);
                } else if (fullPath.endsWith('.spec.ts') || fullPath.endsWith('.spec.tsx')) {
                    const content = readFileSync(fullPath, 'utf8');
                    // Check if spec imports the target module
                    if (content.includes(targetName)) {
                        specs.push(fullPath);
                    }
                }
            }
        } catch (_e: unknown) {

            // ignore
        }
    }

    scan(join(repoRoot, 'src'));

    // Also include the spec file adjacent to the target if it exists
    const adjacentSpecTs = join(dirname(targetFile as string), `__tests__`, `${targetName}.spec.ts`);
    const adjacentSpecTsx = join(dirname(targetFile as string), `__tests__`, `${targetName}.spec.tsx`);
    if (existsSync(adjacentSpecTs) && !specs.includes(adjacentSpecTs)) specs.push(adjacentSpecTs);
    if (existsSync(adjacentSpecTsx) && !specs.includes(adjacentSpecTsx)) specs.push(adjacentSpecTsx);

    return specs;
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
    const targetFile = positional[0];

    if (!targetFile) {
        console.log(red('Usage: swarm test-radius <path/to/modified/file.ts>'));
        return 1;
    }

    const resolved = resolve_within(repoRoot, targetFile);
    if (!resolved.ok) {
        console.error(red(resolved.error.message));
        return 1;
    }

    const s = spinner();
    s.start(`Calculating blast radius for: ${bold(targetFile)}...`);
    const impactedSpecs = find_impacted_specs(repoRoot, resolved.value);

    if (impactedSpecs.length === 0) {
        s.stop(yellow(`No impacted spec files found. Blast radius is isolated.`));
        return 0;
    }

    s.stop(green(`Found ${String(impactedSpecs.length)} impacted spec file(s). Running subset...`));
    impactedSpecs.forEach((sp) => { console.log(dim(`  - ${sp.replace(`${repoRoot}/`, '')}`)); });

    // Run vitest directly with the impacted specs
    const res = spawnSync('pnpm', ['vitest', 'run', ...impactedSpecs.map((sp) => sp.replace(`${repoRoot}/`, ''))], {
        stdio: 'inherit',
        cwd: repoRoot,
    });
    return res.status ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
