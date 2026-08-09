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
const predecessorSource = join(dirname(source), 'agent-policy-predecessors.txt');
const target = new URL('../src/generated/agentPolicy.ts', import.meta.url);
const targetPath = fileURLToPath(target);

function predecessorPolicies() {
    if (!existsSync(predecessorSource))
        throw new Error(`agent policy predecessor manifest not found: ${predecessorSource}`);
    const policies = readFileSync(predecessorSource, 'utf8')
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
    if (new Set(policies).size !== policies.length || policies.some((value) => !/^\d+:[a-f0-9]{64}$/.test(value))) {
        throw new Error(`invalid agent policy predecessor manifest: ${predecessorSource}`);
    }
    return policies;
}

function generatedCurrentPolicy() {
    if (!existsSync(targetPath)) return null;
    const generated = readFileSync(targetPath, 'utf8');
    const version = generated.match(/AGENT_POLICY_VERSION = '(\d+)'/)?.[1];
    const digest = generated.match(/AGENT_POLICY_SHA256 = '([a-f0-9]{64})'/)?.[1];
    return version === undefined || digest === undefined ? null : `${version}:${digest}`;
}

if (!existsSync(source)) {
    if (check && explicit === undefined && process.env.SUSPEC_CANON === undefined) {
        process.stdout.write('agent policy parity skipped: Suspec canon not found\n');
    } else {
        process.stderr.write(`agent policy not found: ${source}\n`);
        process.exitCode = 2;
    }
} else {
    const sourceBytes = readFileSync(source);
    const bytes = sourceBytes.toString('utf8');
    if (!Buffer.from(bytes, 'utf8').equals(sourceBytes)) throw new Error(`agent policy is not valid UTF-8: ${source}`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const predecessors = predecessorPolicies();
    const current = `1:${digest}`;
    if (predecessors.includes(current)) throw new Error(`current agent policy is not a predecessor: ${current}`);
    const generatedCurrent = generatedCurrentPolicy();
    if (generatedCurrent !== null && generatedCurrent !== current && !predecessors.includes(generatedCurrent)) {
        throw new Error(`retain previous agent policy before regeneration: ${generatedCurrent}`);
    }
    const policies = [...predecessors, current];
    const raw = [
        '// Generated from suspec/policy/agent.md. Run scripts/generate-agent-policy.mjs.',
        "export const AGENT_POLICY_VERSION = '1';",
        `export const AGENT_POLICY_SHA256 = '${digest}';`,
        'export const RECOGNIZED_AGENT_POLICIES = new Set([',
        ...policies.map((policy) => `    '${policy}',`),
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
