#!/usr/bin/env node

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { red, cyan, bold, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function generateFuzzTemplate(funcName: string, fileName: string): string {
    return `import { describe, it, expect } from 'vitest';
import { ${funcName} } from '../${fileName}';

describe('${funcName} Fuzzer', () => {
    it('handles unexpected nulls', () => {
        expect(() => ${funcName}(null as any)).not.toThrowError(/cannot read properties of null/i);
    });

    it('handles undefined', () => {
        expect(() => ${funcName}(undefined as any)).not.toThrowError(/cannot read properties of undefined/i);
    });

    it('handles massive arrays/strings', () => {
        const payload = 'A'.repeat(1000000);
        expect(() => ${funcName}(payload as any)).not.toThrowError(/maximum call stack size exceeded/i);
    });

    it('handles cyclic objects', () => {
        const a: any = {};
        a.a = a;
        expect(() => ${funcName}(a)).not.toThrowError(/maximum call stack size exceeded/i);
    });

    it('handles NaN and Infinity', () => {
        expect(() => ${funcName}(NaN as any)).not.toThrow();
        expect(() => ${funcName}(Infinity as any)).not.toThrow();
    });
});
`;
}

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
    const targetFunc = positional[1];
    
    if (!targetFile || !targetFunc) {
        console.log(red('Usage: swarm fuzz <file> <functionName>'));
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

    console.log(cyan(`\nGenerating Auto-Fuzzer Suite for ${bold(targetFunc)}...\n`));

    const content = readFileSync(fullPath, 'utf8');
    if (!content.includes(targetFunc)) {
        console.log(red(`Function ${targetFunc} not found in ${targetFile}.`));
        return 1;
    }

    const testDir = join(repoRoot, targetFile.substring(0, targetFile.lastIndexOf('/')), '__tests__');
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });

    const specFile = join(testDir, `${targetFunc}.fuzz.spec.ts`);
    const template = generateFuzzTemplate(targetFunc, basename(targetFile, '.ts'));

    writeFileSync(specFile, template, 'utf8');

    console.log(green(`✓ Fuzzer suite created: ${specFile.replace(`${repoRoot}/`, '')}`));
    console.log(dim(`Run 'pnpm vitest ${basename(specFile)}' to execute the chaos suite.`));
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
