#!/usr/bin/env node

import { parse_args } from '../../Terminal/useCases/index.ts';
import { list_capabilities } from '../services/registry.ts';

export function run(): number {
    const { flags } = parse_args(process.argv.slice(2));
    const asJson = flags.get('json') === true;

    const capabilities = list_capabilities();

    if (asJson) {
        console.log(JSON.stringify(capabilities, null, 2));
        return 0;
    }

    if (capabilities.length === 0) {
        console.log('No capabilities registered.');
        return 0;
    }

    const byType = new Map<string, typeof capabilities>();
    for (const cap of capabilities) {
        const existing = byType.get(cap.type) ?? [];
        existing.push(cap);
        byType.set(cap.type, existing);
    }

    for (const [type, caps] of byType) {
        console.log(`\n${type.toUpperCase()}s:`);
        for (const cap of caps) {
            console.log(`  ${cap.name.padEnd(16)} ${cap.description}`);
        }
    }

    console.log(`\nTotal: ${String(capabilities.length)} capabilities\n`);
    return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    process.exitCode = run();
}
