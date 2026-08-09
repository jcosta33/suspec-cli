#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const check = process.argv[2] === '--check';
const explicit = process.argv[check ? 3 : 2];
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canon = process.env.SUSPEC_CANON ?? resolve(repository, '..', 'corpus');
const source = resolve(explicit ?? join(canon, 'policy', 'agent.md'));
const target = new URL('../src/generated/agentPolicy.ts', import.meta.url);
const targetPath = fileURLToPath(target);

if (!existsSync(source)) {
    if (check && explicit === undefined && process.env.SUSPEC_CANON === undefined) {
        process.stdout.write('agent policy parity skipped: Suspec canon not found\n');
    } else {
        process.stderr.write(`agent policy not found: ${source}\n`);
        process.exitCode = 2;
    }
} else {
    const bytes = readFileSync(source, 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const raw = [
        '// Generated from suspec/policy/agent.md. Run scripts/generate-agent-policy.mjs.',
        "export const AGENT_POLICY_VERSION = '1';",
        `export const AGENT_POLICY_SHA256 = '${digest}';`,
        'export const RECOGNIZED_AGENT_POLICIES = new Set([',
        `    '1:${digest}',`,
        ']);',
        `export const AGENT_POLICY = ${JSON.stringify(bytes)};`,
        '',
    ].join('\n');
    const output = await format(raw, { ...(await resolveConfig(targetPath)), filepath: targetPath });
    if (check) {
        if (readFileSync(target, 'utf8') !== output) {
            process.stderr.write('generated agent policy is stale\n');
            process.exitCode = 1;
        }
    } else {
        writeFileSync(target, output, 'utf8');
    }
}
