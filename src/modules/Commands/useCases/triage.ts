#!/usr/bin/env node

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { red, cyan, bold, dim, green, parse_args } from '../../Terminal/useCases/index.ts';
import { get_repo_root } from '../../Workspace/useCases/index.ts';

export function generateBugSpec(content: string, slug: string): string {
    return `# Bug: ${slug}

## Raw Report
> The following is the unstructured report. Do NOT fix the code until you have translated this into verifiable reproduction steps and acceptance criteria.

\`\`\`text
${content}
\`\`\`

---

## Reproduction Steps
1. [Agent to fill this out]
2. ...

## Acceptance Criteria
<acceptance_criteria>

- [ ] [Agent to define criteria]
- [ ] ...

</acceptance_criteria>

## Technical Constraints
- Must include a new test case validating the fix.
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

    const { positional, flags } = parse_args(process.argv.slice(2));
    const rawFile = positional[0];
    const slugFlag = flags.get('slug');
    const slug = typeof slugFlag === 'string' && slugFlag ? slugFlag : basename(rawFile || 'bug', '.txt');
    
    if (!rawFile) {
        console.log(red('Usage: swarm triage <path/to/raw-report.txt> [--slug my-bug-slug]'));
        return 1;
    }

    const fullPath = join(repoRoot, rawFile);
    if (!existsSync(fullPath)) {
        console.error(red(`File not found: ${rawFile}`));
        return 1;
    }

    const content = readFileSync(fullPath, 'utf8');

    const specsDir = join(repoRoot, '.agents', 'specs');
    if (!existsSync(specsDir)) mkdirSync(specsDir, { recursive: true });

    const specPath = join(specsDir, `${slug}.md`);

    console.log(cyan(`\nTriaging bug report into spec: ${bold(slug)}...`));

    const template = generateBugSpec(content, slug);

    writeFileSync(specPath, template, 'utf8');
    console.log(green(`  ✓ Created spec: `) + dim(specPath));
    console.log(dim(`  (Agent should now read the spec, fill in the repro steps, and proceed)`));
    console.log('');
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
