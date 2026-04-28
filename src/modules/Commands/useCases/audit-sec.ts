#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { red, cyan, bold, dim, green, yellow, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root, resolve_within } from '../../Workspace/useCases/index.ts';

const RISKY_PATTERNS = [
    { regex: /\beval\s*\(/g, description: 'Usage of eval() is highly dangerous.' },
    { regex: /dangerouslySetInnerHTML/g, description: 'React dangerouslySetInnerHTML found. XSS risk.' },
    { regex: /localStorage\.setItem\(\s*['"]token['"]/g, description: 'Storing auth tokens in localStorage exposes them to XSS.' },
    { regex: /\bAPI_KEY\s*=/g, description: 'Potential hardcoded API_KEY detected.' },
    { regex: /\bSECRET\s*=/g, description: 'Potential hardcoded SECRET detected.' },
];

export function auditSecurity(content: string) {
    const lines = content.split('\n');
    const issues = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        for (const pattern of RISKY_PATTERNS) {
            if (pattern.regex.test(line)) {
                issues.push({
                    line: i + 1,
                    text: line.trim(),
                    description: pattern.description
                });
            }
        }
    }
    return issues;
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
    
    if (!targetFile) {
        console.log(red('Usage: swarm audit-sec <path/to/file.ts>'));
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
    const issues = auditSecurity(content);

    console.log(cyan(`\nSecurity Audit for ${bold(targetFile)}:`));
    
    if (issues.length === 0) {
        console.log(green(`✓ No obvious security vulnerabilities found.`));
    } else {
        console.log(red(`✗ Found ${String(issues.length)} potential security risks:`));
        issues.forEach(issue => {
            console.log(`  Line ${cyan(String(issue.line))}: ${yellow(issue.description)}`);
            console.log(dim(`    > ${issue.text}`));
        });
        return 1; // Fail the script
    }
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
