#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

export function generateMockFactory(content: string, interfaceName: string, fileName: string): string {
    const interfaceRegex = new RegExp(`interface\\s+${interfaceName}\\s*(?:extends\\s+[^{]+)?\\s*\\{([^}]*)\\}`, 's');
    const match = content.match(interfaceRegex);

    let mockProperties = `
        // TODO: Fill in default realistic mock values
    `;

    if (match?.[1]) {
        const body = match[1];
        const lines = body
            .split(/[;\n]/)
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('//') && !l.startsWith('/*'));
        const props: string[] = [];
        for (const line of lines) {
            const propMatch = /^([a-zA-Z0-9_]+)\s*[:?]/.exec(line);
            if (propMatch) {
                const prop = propMatch[1];
                let defaultVal = 'null';
                if (line.includes('=>') || line.includes('()')) defaultVal = 'vi.fn()';
                else if (line.includes('[]') || line.includes('Array')) defaultVal = '[]';
                else if (line.includes(': string')) defaultVal = `'mock_${prop}'`;
                else if (line.includes(': number')) defaultVal = '0';
                else if (line.includes(': boolean')) defaultVal = 'false';

                props.push(`        ${prop}: ${defaultVal},`);
            }
        }
        if (props.length > 0) {
            mockProperties = `\n${props.join('\n')}\n    `;
        }
    }

    return `import { vi } from 'vitest';
import type { ${interfaceName} } from './${fileName}';

export const createMock${interfaceName} = (
    overrides?: Partial<${interfaceName}>
): ${interfaceName} => ({${mockProperties}...overrides,
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
    const interfaceName = positional[1];
    
    if (!targetFile || !interfaceName) {
        console.log(red('Usage: swarm mock <path/to/file.ts> <InterfaceName>'));
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

    const content = readFileSync(fullPath, 'utf8');
    const fileName = targetFile.split('/').pop()?.replace('.ts', '') ?? '';
    const factoryCode = generateMockFactory(content, interfaceName, fileName);

    console.log(cyan(`\nGenerating Mock Factory for ${bold(interfaceName)}...\n`));
    console.log(green(factoryCode));
    console.log(dim(`\nCopy/paste this into your test file or a __mocks__ folder.`));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
