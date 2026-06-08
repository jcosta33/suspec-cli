#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { red, green, yellow, dim, bold, parse_args } from '../../Terminal/useCases/index.ts';
import { parse_spec } from '../../Sol/useCases/index.ts';

// `swarm lint <file.swarm.md> ...` — parse each spec via swarm-core (the Sol module) and report its SOL
// diagnostics. v1 surfaces the parser's block-level structural (SOL-S) diagnostics + parse failures; the
// full five-layer linter (the sol-lint spec) layers P/M/V/O on top later. Exit is non-zero iff a blocking
// diagnostic fired (the CI-meaningful contract).
export function run(): number {
    const { positional } = parse_args(process.argv.slice(2));
    if (positional.length === 0) {
        console.error(red('Usage: swarm lint <file.swarm.md> ...'));
        return 2;
    }

    let blocking = 0;
    let advisory = 0;

    for (const file of positional) {
        if (!existsSync(file)) {
            console.error(red(`✗ ${file}: file not found`));
            blocking += 1;
            continue;
        }
        const result = parse_spec({ source: readFileSync(file, 'utf8'), path: file });
        if (!result.ok) {
            console.error(red(`✗ ${file}: parse failed — ${result.error.reason}: ${result.error.message}`));
            blocking += 1;
            continue;
        }
        const { diagnostics } = result.value;
        if (diagnostics.length === 0) {
            console.log(green(`✓ ${file}: clean`));
            continue;
        }
        for (const diagnostic of diagnostics) {
            const code = diagnostic.severity === 'BLOCKING' ? red(diagnostic.code) : yellow(diagnostic.code);
            const suggest = diagnostic.suggest ? dim(` — ${diagnostic.suggest}`) : '';
            console.log(`  ${bold(`${diagnostic.span.file}:${diagnostic.span.line_start}`)} ${code} ${diagnostic.message}${suggest}`);
            if (diagnostic.severity === 'BLOCKING') {
                blocking += 1;
            } else {
                advisory += 1;
            }
        }
    }

    if (blocking > 0) {
        console.error(red(`\n✗ ${blocking} blocking diagnostic(s)${advisory > 0 ? `, ${advisory} advisory` : ''}`));
        return 1;
    }
    console.log(green(`\n✓ clean${advisory > 0 ? ` (${advisory} advisory)` : ''}`));
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
