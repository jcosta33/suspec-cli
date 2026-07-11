// `suspec` / `suspec help` / `suspec --help` / `suspec check --help` — the usage reference, driven
// by COMMAND_CATALOG, which a test pins to the dispatcher's command map. Plain stdout
// (scriptable), coloured for humans; picocolors no-ops when output is not a TTY.

import color from 'picocolors';

import { COMMAND_CATALOG } from './catalog.ts';

export function print_usage(): void {
    const lines = [
        `${color.bold('suspec')} — the deterministic checker for Suspec artifacts`,
        '',
        color.bold('Usage'),
        ...COMMAND_CATALOG.flatMap((entry) => entry.usage.map((line) => `  ${line}`)),
        '',
        color.bold('Global flags'),
        '  --help · -h               show this reference',
        '  --version · -v            print the version',
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
}
