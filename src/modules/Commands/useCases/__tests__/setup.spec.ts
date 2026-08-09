import { createHash } from 'node:crypto';
import {
    chmodSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_POLICY, AGENT_POLICY_SHA256, RECOGNIZED_AGENT_POLICIES } from '../../../../generated/agentPolicy.ts';
import { run } from '../setup.ts';

function previous_policy(): string {
    return AGENT_POLICY.replace(
        'Project systems enforce delivery transitions. Harness permissions isolate worker authority.',
        'Project systems and harness permissions enforce delivery.'
    );
}

function installed_policy(original: string, policy: string, digest: string): string {
    const body = policy.replace(/\n$/, '');
    const content = createHash('sha256').update(body).digest('hex');
    return `${original}\n<!-- agent-policy version=1 policy=${digest} content=${content} origin=existing -->\n${body}\n<!-- /agent-policy -->`;
}

function fixture() {
    const home = mkdtempSync(join(tmpdir(), 'suspec-setup-'));
    mkdirSync(join(home, '.codex'));
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.kimi-code'));
    mkdirSync(join(home, '.zcode'));
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = {
        env: { HOME: home } as NodeJS.ProcessEnv,
        stdout: (text: string) => stdout.push(text),
        stderr: (text: string) => stderr.push(text),
        uid: process.geteuid?.(),
    };
    return {
        home,
        context,
        stdout,
        stderr,
        cleanup: () => rmSync(home, { recursive: true, force: true }),
    };
}

describe('setup', () => {
    it('requires explicit unique supported harnesses and coherent modes', () => {
        const f = fixture();
        try {
            expect(run([], f.context)).toBe(2);
            expect(run(['bogus'], f.context)).toBe(2);
            expect(run(['codex', 'codex'], f.context)).toBe(2);
            expect(run(['codex', '--check', '--remove'], f.context)).toBe(2);
            expect(run(['codex', '--check', '--yes'], f.context)).toBe(2);
            expect(run(['codex', '--wat'], f.context)).toBe(2);
            expect(f.stderr.join('')).toContain('name at least one harness');
        } finally {
            f.cleanup();
        }
    });

    it('previews without writing and dry-run succeeds without writing', () => {
        const f = fixture();
        try {
            expect(run(['codex'], f.context)).toBe(1);
            expect(run(['codex', 'claude-code', 'kimi-code', 'zcode', 'opencode', '--dry-run'], f.context)).toBe(0);
            expect(() => lstatSync(join(f.home, '.agents'))).toThrow();
            expect(() => readFileSync(join(f.home, '.codex', 'AGENTS.md'))).toThrow();
        } finally {
            f.cleanup();
        }
    });

    it('installs, checks, and removes all harnesses in input order', () => {
        const f = fixture();
        try {
            const harnesses = ['claude-code', 'codex', 'kimi-code', 'zcode', 'opencode'];
            expect(run([...harnesses, '--yes'], f.context)).toBe(0);
            expect(() => lstatSync(join(f.home, '.agents'))).toThrow();
            for (const path of [
                join(f.home, '.claude', 'CLAUDE.md'),
                join(f.home, '.codex', 'AGENTS.md'),
                join(f.home, '.kimi-code', 'AGENTS.md'),
                join(f.home, '.zcode', 'AGENTS.md'),
                join(f.home, '.config', 'opencode', 'AGENTS.md'),
            ]) {
                const installed = readFileSync(path, 'utf8');
                expect(installed).toContain(AGENT_POLICY.trimEnd());
                expect(installed).toContain('Use project-native delivery controls when present. Never bypass them.');
                expect(installed).toContain('This routing rule is advisory.');
                expect(installed).toContain(
                    'Project systems enforce delivery transitions. Harness permissions isolate worker authority.'
                );
                expect(installed).not.toContain('suspec');
            }

            f.stdout.length = 0;
            expect(run([...harnesses, '--check', '--json'], f.context)).toBe(0);
            const envelope = JSON.parse(f.stdout.join('')) as {
                version: string;
                ok: boolean;
                targets: { harness: string; state: string; paths: string[] }[];
            };
            expect(envelope.version).toBe('2');
            expect(envelope.ok).toBe(true);
            expect(envelope.targets.map((target) => target.harness)).toEqual(harnesses);
            expect(envelope.targets.every((target) => target.state === 'current')).toBe(true);
            expect(envelope.targets.every((target) => target.paths.length === 1)).toBe(true);
            expect(envelope.targets.flatMap((target) => target.paths).join('\n')).not.toContain('.agents');

            f.stdout.length = 0;
            expect(run([...harnesses, '--remove'], f.context)).toBe(1);
            expect(run([...harnesses, '--remove', '--yes'], f.context)).toBe(0);
            expect(() => readFileSync(join(f.home, '.codex', 'AGENTS.md'))).toThrow();
        } finally {
            f.cleanup();
        }
    });

    it('upgrades and removes a previous canonical policy but rejects forged bytes', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        const original = 'original';
        const previous = previous_policy();
        const previousDigest = createHash('sha256').update(previous).digest('hex');
        try {
            expect(previous).not.toBe(AGENT_POLICY);
            expect(RECOGNIZED_AGENT_POLICIES.has(`1:${previousDigest}`)).toBe(true);
            expect(RECOGNIZED_AGENT_POLICIES.has(`1:${AGENT_POLICY_SHA256}`)).toBe(true);

            writeFileSync(target, installed_policy(original, previous, previousDigest));
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            expect(readFileSync(target, 'utf8')).toContain(AGENT_POLICY.trimEnd());

            writeFileSync(target, installed_policy(original, previous, previousDigest));
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(0);
            expect(readFileSync(target, 'utf8')).toBe(original);

            writeFileSync(target, installed_policy(original, 'forged\n', previousDigest));
            expect(run(['codex', '--check'], f.context)).toBe(1);
        } finally {
            f.cleanup();
        }
    });

    it('round-trips CRLF and no-final-newline foreign content', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        const original = 'alpha\r\nbeta';
        try {
            writeFileSync(target, original);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const installed = readFileSync(target, 'utf8');
            expect(installed.startsWith(`${original}\r\n`)).toBe(true);
            expect(installed.endsWith('-->')).toBe(true);
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(0);
            expect(readFileSync(target, 'utf8')).toBe(original);
        } finally {
            f.cleanup();
        }
    });

    it('rejects invalid UTF-8 without changing foreign bytes', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        const original = Buffer.from([0x66, 0xff, 0x6f]);
        try {
            writeFileSync(target, original);
            expect(run(['codex', '--yes'], f.context)).toBe(2);
            expect(readFileSync(target)).toEqual(original);
        } finally {
            f.cleanup();
        }
    });

    it('accepts terminal-newline normalization and still restores foreign bytes', () => {
        for (const original of ['alpha', 'alpha\n']) {
            const f = fixture();
            const target = join(f.home, '.codex', 'AGENTS.md');
            try {
                writeFileSync(target, original);
                expect(run(['codex', '--yes'], f.context)).toBe(0);
                const installed = readFileSync(target, 'utf8');
                writeFileSync(target, installed.endsWith('\n') ? installed.slice(0, -1) : `${installed}\n`);
                expect(run(['codex', '--check'], f.context)).toBe(0);
                expect(run(['codex', '--remove', '--yes'], f.context)).toBe(0);
                expect(readFileSync(target, 'utf8')).toBe(original);
            } finally {
                f.cleanup();
            }
        }
    });

    it('blocks drift, symlinks, and held locks', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            const target = join(f.home, '.codex', 'AGENTS.md');
            writeFileSync(target, readFileSync(target, 'utf8').replace('No preamble,', 'Changed,'));
            expect(run(['codex', '--check'], f.context)).toBe(1);

            rmSync(target, { force: true });
            const outside = join(f.home, 'outside.md');
            writeFileSync(outside, 'outside');
            symlinkSync(outside, target);
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(target);

            writeFileSync(join(f.home, '.agent-policy.lock'), 'held');
            expect(run(['codex', '--yes'], f.context)).toBe(2);
            rmSync(join(f.home, '.agent-policy.lock'));
        } finally {
            f.cleanup();
        }
    });

    it('fails closed on ambiguous harness configuration', () => {
        const f = fixture();
        try {
            writeFileSync(join(f.home, '.codex', 'AGENTS.override.md'), 'override');
            expect(run(['codex', '--yes'], f.context)).toBe(2);
            expect(readFileSync(join(f.home, '.codex', 'AGENTS.override.md'), 'utf8')).toBe('override');
            expect(() => readFileSync(join(f.home, '.codex', 'AGENTS.md'))).toThrow();
            rmSync(join(f.home, '.codex', 'AGENTS.override.md'));
            writeFileSync(join(f.home, '.codex', 'work.config.toml'), 'model_instructions_file = "x"\n');
            expect(run(['codex', '--check'], f.context)).toBe(1);

            f.context.env.OPENCODE_CONFIG_CONTENT = '{}';
            expect(run(['opencode', '--check'], f.context)).toBe(2);
            delete f.context.env.OPENCODE_CONFIG_CONTENT;
            writeFileSync(join(f.home, '.config', 'opencode', 'opencode.jsonc'), '{"instructions":["x"]}');
            expect(run(['opencode', '--check'], f.context)).toBe(2);

            rmSync(join(f.home, '.codex', 'work.config.toml'));
            const outside = join(f.home, 'outside.toml');
            writeFileSync(outside, 'model_instructions_file = "x"\n');
            symlinkSync(outside, join(f.home, '.codex', 'linked.config.toml'));
            expect(run(['codex', '--check'], f.context)).toBe(2);
        } finally {
            f.cleanup();
        }
    });

    it('emits one JSON error and rejects unsafe HOME and missing config roots', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--check', '--json'], { ...f.context, env: { HOME: 'relative' } })).toBe(2);
            const value = JSON.parse(f.stdout.pop() ?? '') as { ok: boolean; error: string };
            expect(value.ok).toBe(false);
            expect(value.error).toContain('HOME must be an absolute path');

            f.context.env.CODEX_HOME = join(f.home, 'missing');
            expect(run(['codex', '--check'], f.context)).toBe(2);
        } finally {
            f.cleanup();
        }
    });

    it('preserves mode and generated policy digest', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        try {
            writeFileSync(target, 'existing\n');
            chmodSync(target, 0o640);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            expect((lstatSync(target).mode & 0o777).toString(8)).toBe('640');
            expect(createHash('sha256').update(AGENT_POLICY).digest('hex')).toBe(AGENT_POLICY_SHA256);
        } finally {
            f.cleanup();
        }
    });

    it('rejects unsafe homes, config roots, ownership, and worktrees', () => {
        const f = fixture();
        const linkedHome = `${f.home}-link`;
        try {
            const fileHome = join(f.home, 'file-home');
            writeFileSync(fileHome, 'x');
            expect(run(['codex', '--check'], { ...f.context, env: { HOME: fileHome } })).toBe(2);

            symlinkSync(f.home, linkedHome);
            expect(run(['codex', '--check'], { ...f.context, env: { HOME: linkedHome } })).toBe(2);
            rmSync(linkedHome);

            f.context.env.CODEX_HOME = '.codex';
            expect(run(['codex', '--check'], f.context)).toBe(2);
            f.context.env.CODEX_HOME = f.home;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            f.context.env.CODEX_HOME = fileHome;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            f.context.env.CLAUDE_CONFIG_DIR = fileHome;
            expect(run(['claude-code', '--check'], f.context)).toBe(2);
            delete f.context.env.CLAUDE_CONFIG_DIR;
            f.context.env.KIMI_CODE_HOME = fileHome;
            expect(run(['kimi-code', '--check'], f.context)).toBe(2);
            delete f.context.env.KIMI_CODE_HOME;
            const linkedRoot = join(f.home, 'linked-codex');
            symlinkSync(join(f.home, '.codex'), linkedRoot);
            f.context.env.CODEX_HOME = linkedRoot;
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(linkedRoot);
            f.context.env.CODEX_HOME = join(f.home, '.codex');
            writeFileSync(join(f.home, '.codex', '.git'), 'gitdir: elsewhere');
            expect(run(['codex', '--check'], f.context)).toBe(2);
            rmSync(join(f.home, '.codex', '.git'));

            writeFileSync(join(f.home, '.codex', 'AGENTS.md'), 'foreign');
            expect(run(['codex', '--check'], { ...f.context, uid: (f.context.uid ?? 0) + 1 })).toBe(2);
        } finally {
            rmSync(linkedHome, { force: true });
            f.cleanup();
        }
    });

    it('rejects every malformed owned-block boundary', () => {
        const mutations: [(source: string) => string, number][] = [
            [(source) => `${source}${source}`, 2],
            [(source) => source.replace(' -->\n# Interaction', ' --># Interaction'), 2],
            [(source) => source.replace('\n<!-- /agent-policy -->', '<!-- /agent-policy -->'), 2],
            [(source) => source.replace(`policy=${AGENT_POLICY_SHA256}`, `policy=${'0'.repeat(64)}`), 1],
            [(source) => `${source}foreign`, 2],
            [(source) => source.replace('\n<!-- agent-policy ', '<!-- agent-policy '), 2],
        ];
        for (const [mutate, expectedExit] of mutations) {
            const f = fixture();
            try {
                const target = join(f.home, '.codex', 'AGENTS.md');
                writeFileSync(target, 'prefix');
                expect(run(['codex', '--yes'], f.context)).toBe(0);
                writeFileSync(target, mutate(readFileSync(target, 'utf8')));
                expect(run(['codex', '--check'], f.context)).toBe(expectedExit);
            } finally {
                f.cleanup();
            }
        }
    });

    it('covers idempotence, absent removal, and default process output', () => {
        const f = fixture();
        try {
            expect(run(['codex', '--remove'], f.context)).toBe(1);
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            expect(run(['codex', '--yes'], f.context)).toBe(0);

            const previous = process.stderr.write;
            let written = '';
            process.stderr.write = (value: string | Uint8Array) => {
                written += String(value);
                return true;
            };
            try {
                expect(run([])).toBe(2);
            } finally {
                process.stderr.write = previous;
            }
            expect(written).toContain('name at least one harness');

            const previousStdout = process.stdout.write;
            let json = '';
            process.stdout.write = (value: string | Uint8Array) => {
                json += String(value);
                return true;
            };
            try {
                expect(run(['--json'])).toBe(2);
            } finally {
                process.stdout.write = previousStdout;
            }
            expect(JSON.parse(json)).toMatchObject({ ok: false, operation: 'install' });
        } finally {
            f.cleanup();
        }
    });

    it('never deletes foreign content added to a setup-created target', () => {
        const f = fixture();
        const target = join(f.home, '.codex', 'AGENTS.md');
        try {
            expect(run(['codex', '--yes'], f.context)).toBe(0);
            writeFileSync(target, `foreign\n${readFileSync(target, 'utf8')}`);
            expect(run(['codex', '--remove', '--yes'], f.context)).toBe(2);
            expect(readFileSync(target, 'utf8')).toContain('foreign');
        } finally {
            f.cleanup();
        }
    });
});
